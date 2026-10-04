import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { CHARACTER_APPEARANCES, CHARACTER_COUNT, DEFAULT_AGENT_DEFS, AGENT_PRESETS, translateUI } from '../../packages/shared/src/index';
import { decodeCharacterAtlas } from '../../apps/web/src/components/office/sprites/characterAtlas';
import { getCharacterThumbnail, getCharacterSprites, setCharacterTemplates } from '../../apps/web/src/components/office/sprites/spriteData';
import { loadCharacterSprite, loadCharacterSprites } from '../../apps/web/src/components/office/sprites/characterLoader';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next')] }));
const expectedIds = ['rex', 'alex', 'mia', 'leo', 'nova', 'luna', 'marcus', 'sophie'];
assert.deepEqual(DEFAULT_AGENT_DEFS.map(def => def.id), expectedIds, 'saved team references keep their IDs');
assert.equal(CHARACTER_COUNT, 14);
assert.equal(new Set(DEFAULT_AGENT_DEFS.map(def => def.palette)).size, 8, 'every preset has its own appearance');
assert.equal(DEFAULT_AGENT_DEFS.filter(def => def.teamRole === 'dev').length, 6);
assert.equal(DEFAULT_AGENT_DEFS.filter(def => def.teamRole === 'leader').length, 1);
assert.equal(DEFAULT_AGENT_DEFS.filter(def => def.teamRole === 'reviewer').length, 1);
for (const [index, def] of DEFAULT_AGENT_DEFS.entries()) {
  assert.equal(def.name, CHARACTER_APPEARANCES[def.palette].name);
  assert.equal(AGENT_PRESETS[index].name, def.name);
  assert.notEqual(translateUI(def.role, 'zh'), def.role, `${def.name}: Chinese role required`);
}
assert.equal(translateUI('REVIEWER', 'zh'), '审查者');
assert.throws(() => decodeCharacterAtlas({ width: 1, height: 1, data: new Uint8Array(4) }));

async function verify() {
  const characters = [];
  let fixture: { data: Uint8Array; width: number; height: number };
  for (const character of CHARACTER_APPEARANCES) {
    const path = new URL(`../../apps/web/public${character.asset}`, import.meta.url);
    const original = fs.readFileSync(path);
    const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const sprites = decodeCharacterAtlas({ data, width: info.width, height: info.height });
    fixture ??= { data, width: info.width, height: info.height };
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
    assert.ok(transparent / (info.width * info.height) > 0.2, `${character.name}: real transparency required`);
    for (const [direction, frames] of Object.entries(sprites)) {
      assert.equal(frames.length, 7);
      for (const frame of frames) {
        assert.equal(frame.length, 32);
        assert.ok(frame.every(row => row.length === 16));
        assert.ok(frame.flat().filter(Boolean).length > 100, `${character.name} ${direction}: visible complete sprite`);
        assert.ok(frame.every(row => row[0] === '' && row[15] === ''), 'transparent side gutters prevent frame clipping');
      }
      assert.notDeepEqual(frames[0], frames[2], `${character.name} ${direction}: walking steps must differ`);
    }
    assert.notDeepEqual(sprites.down[1], sprites.up[1], `${character.name}: rear view must differ from portrait`);
    characters.push(sprites);
    console.log(`${character.name}：透明背景、21 个动作帧、朝向与行走动画通过。`);
  }
  // Regression: loading a member panel before mounting the office must work.
  // Simulate browser image/canvas APIs, with one transient image failure.
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const requests = new Map<string, number>();
  const portraitCopies: number[][] = [];
  class TestImage {
    naturalWidth = fixture.width;
    naturalHeight = fixture.height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(asset: string) {
      const count = (requests.get(asset) ?? 0) + 1;
      requests.set(asset, count);
      queueMicrotask(() => {
        if (asset === CHARACTER_APPEARANCES[0].asset && count === 1) this.onerror?.();
        else this.onload?.();
      });
    }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: TestImage });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ getContext: () => ({
      drawImage(_image: unknown, ...coords: number[]) { if (coords.length === 8) portraitCopies.push(coords); },
      getImageData: () => fixture,
    }) }),
  } });
  try {
    assert.equal(getCharacterThumbnail(0), null, 'office engine has not been initialized');
    const failed = loadCharacterSprite(0);
    const first = loadCharacterSprite(1);
    assert.strictEqual(loadCharacterSprite(1), first, 'concurrent avatar mounts share the same request');
    await assert.rejects(failed, /failed to load/);
    const loaded = await first;
    assert.ok(loaded.down[1].flat().some(Boolean), 'another member still loads after one fails');
    assert.ok(loaded.portrait.width > 16 && loaded.portrait.height > 32, 'UI portrait retains source resolution');
    assert.ok((await loadCharacterSprite(0)).down[1].flat().some(Boolean), 'failed requests can retry');
    assert.equal(getCharacterThumbnail(0), null, 'avatars load without office engine initialization');
    assert.equal((await loadCharacterSprites()).length, CHARACTER_COUNT, 'scene can reuse the same cache afterward');
    for (const [index, character] of CHARACTER_APPEARANCES.entries()) {
      assert.equal(requests.get(character.asset), index === 0 ? 2 : 1, 'successful character images are loaded once');
    }
    assert.equal(portraitCopies.length, CHARACTER_COUNT);
    for (const coords of portraitCopies) {
      assert.equal(coords[2], coords[6], 'portrait copy preserves original pixel width');
      assert.equal(coords[3], coords[7], 'portrait copy preserves original pixel height');
    }
    console.log('14 张头像保留原图像素，不经过游戏低分辨率网格。');
    console.log('头像独立加载、并发缓存、单人失败隔离及失败重试验证通过。');
  } finally {
    for (const [key, descriptor] of [['Image', originalImage], ['document', originalDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
  setCharacterTemplates(characters);
  const thumbnails = CHARACTER_APPEARANCES.map((_, index) => JSON.stringify(getCharacterThumbnail(index)));
  assert.equal(new Set(thumbnails).size, CHARACTER_COUNT, 'each appearance must retain its own face');
  for (let index = 0; index < CHARACTER_COUNT; index++) assert.ok(getCharacterSprites(index));
  console.log('14 款形象与真实渲染接口验证通过，原有团队分工与 ID 保持兼容。');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
