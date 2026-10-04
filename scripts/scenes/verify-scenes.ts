import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { OfficeState } from '../../apps/web/src/components/office/engine/officeState';
import { FURNITURE_CATALOG, getCatalogEntry } from '../../apps/web/src/components/office/layout/furnitureCatalog';
import { findPath } from '../../apps/web/src/components/office/layout/tileMap';
import { translateUI } from '../../packages/shared/src/ui-language';
import type { OfficeLayout } from '../../apps/web/src/components/office/types';
import './verify-garden-studio';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const JSZip = require('jszip');
const output = new URL('../../apps/web/public/offices/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('index.json', output), 'utf8'));
const maps = JSON.parse(fs.readFileSync(new URL('./maps.json', import.meta.url), 'utf8'));
const originalIds = ['default', 'Modern', 'Cute Whimsical', 'Mythological', 'Cyberpunk', 'SciFi', 'Post Apocalyptic', 'Historical', 'Eastern Fantasy', 'Western Fantasy', 'Gothic', 'DarkLegend'];
assert.deepEqual(manifest.map((scene: { id: string }) => scene.id), originalIds, 'retain every original scene category');
const hashes = new Set<string>();
const orientations = ['front', 'right', 'back', 'left'] as const;
for (const type of ['desk', 'chair']) {
  const base = getCatalogEntry(type)!;
  for (const orientation of orientations) if (!getCatalogEntry(`${type}-${orientation}`)) {
    FURNITURE_CATALOG.push({ ...base, type: `${type}-${orientation}`, orientation, footprintW: 1, footprintH: 1 });
  }
}

async function verify() {
  for (const scene of manifest) {
    const asset = scene.file.replace(/\.zip$/, '');
    const image = fs.readFileSync(new URL(scene.thumbnail, output));
    const hash = createHash('sha256').update(image).digest('hex');
    assert.ok(!hashes.has(hash), `${scene.id}: each choice needs its own background`);
    hashes.add(hash);
    const zip = await JSZip.loadAsync(fs.readFileSync(new URL(scene.file, output)));
    const room = JSON.parse(await zip.file('room.json').async('text'));
    assert.equal(room.name, asset);
    assert.deepEqual(await zip.file(room.backgroundFile).async('nodebuffer'), image, `${asset}: preview and loaded background must match`);
    assert.equal(room.backgroundWidth, image.readUInt32BE(16));
    assert.equal(room.backgroundHeight, image.readUInt32BE(20));
    assert.equal(room.tiles.length, room.cols * room.rows);
    for (const copy of [scene.name, scene.theme, scene.description]) assert.notEqual(translateUI(copy, 'zh'), copy, `${asset}: Chinese translation missing`);
    const map = maps[asset];
    if (!map) continue; // Garden is covered by the dedicated regression checks above.
    const layout: OfficeLayout = { version: 1, cols: room.cols, rows: room.rows, tiles: room.tiles,
      furniture: room.objects.map((object: { id: string; type: string; col: number; row: number; rotation: number }) => ({ uid: object.id, type: `${object.type}-${orientations[object.rotation / 90]}`, col: object.col, row: object.row })),
    };
    const office = new OfficeState(layout), seats = [...office.seats.values()];
    const workSeats = seats.filter(seat => !seat.isRest);
    assert.equal(workSeats.length, 6, `${asset}: six paired workstations`);
    assert.ok(workSeats.every(seat => seat.uid.includes('-chair-')), `${asset}: no accidental standing desk seats`);
    assert.equal(seats.filter(seat => seat.isRest).length, map.rest.length);
    for (const seat of seats) {
      assert.equal(room.tiles[seat.seatRow * room.cols + seat.seatCol], 1, `${asset}: ${seat.uid} must be on floor`);
      const blockers = new Set(office.blockedTiles);
      blockers.delete(`${seat.seatCol},${seat.seatRow}`);
      assert.ok(findPath(map.entry[0], map.entry[1], seat.seatCol, seat.seatRow, office.tileMap, blockers).length, `${asset}: entry must reach ${seat.uid} with other chairs blocked`);
    }
    assert.equal(findPath(map.entry[0], map.entry[1], map.solidProbe[0], map.solidProbe[1], office.tileMap, office.blockedTiles).length, 0, `${asset}: furniture or water must remain blocked`);
    if (map.walkProbe) assert.ok(findPath(map.entry[0], map.entry[1], map.walkProbe[0], map.walkProbe[1], office.tileMap, office.blockedTiles).length, `${asset}: bridge or floor ornament must be walkable`);
    // Real pathfinder verifies all destinations, including narrow doorways and side aisles.
    for (const tile of office.walkableTiles) {
      if (tile.col === map.entry[0] && tile.row === map.entry[1]) continue;
      assert.ok(findPath(map.entry[0], map.entry[1], tile.col, tile.row, office.tileMap, office.blockedTiles).length, `${asset}: unreachable idle destination ${tile.col},${tile.row}`);
    }
    office.spawnTestCharacters();
    assert.equal(office.characters.size, 6);
    assert.equal(new Set([...office.characters.values()].map(character => character.seatId)).size, 6, `${asset}: members must have distinct seats`);
    console.log(`${translateUI(scene.name, 'zh')}：场景包、中文、6 个工位与全部行走区域通过。`);
  }
  assert.equal(hashes.size, 12);
  console.log('全部 12 类场景验收通过。');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
