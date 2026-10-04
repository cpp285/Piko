import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import './build-garden-studio.mjs';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const JSZip = require('jszip');
const output = new URL('../../apps/web/public/offices/', import.meta.url);
const catalog = JSON.parse(await fs.readFile(new URL('./catalog.json', import.meta.url), 'utf8'));
const maps = JSON.parse(await fs.readFile(new URL('./maps.json', import.meta.url), 'utf8'));
const manifest = [];

for (const scene of catalog) {
  const map = maps[scene.asset];
  if (map) {
    const image = await fs.readFile(new URL(`${scene.asset}.png`, output));
    const cols = 64, rows = 64, tiles = Array(cols * rows).fill(8);
    const paint = ([left, top, right, bottom], value) => {
      for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) tiles[row * cols + col] = value;
    };
    map.floors.forEach(rect => paint(rect, 1));
    map.blocks.forEach(rect => paint(rect, 0));
    for (const [cx, cy, rx, ry] of map.ellipses || []) {
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        if (((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2 <= 1) tiles[row * cols + col] = 0;
      }
    }
    (map.openings || []).forEach(rect => paint(rect, 1));
    const objects = [];
    const marker = (id, type, col, row, rotation = 0) => objects.push({ id: `obj-${scene.asset}-${id}`, type, col, row, rotation });
    for (const [index, [col, row]] of map.work.entries()) {
      marker(`desk-${index}`, 'desk', col, row - 2);
      marker(`chair-${index}`, 'chair', col, row);
      tiles[(row - 2) * cols + col] = 0;
    }
    for (const [index, [col, row, rotation]] of map.rest.entries()) marker(`rest-${index}`, 'chair', col, row, rotation);

    // Discard decorative floor pockets unreachable from the entrance.
    const key = (col, row) => row * cols + col;
    const queue = [map.entry], accessible = new Set([key(...map.entry)]);
    for (let head = 0; head < queue.length; head++) {
      const [col, row] = queue[head];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = col + dc, nr = row + dr, index = key(nc, nr);
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || tiles[index] !== 1 || accessible.has(index)) continue;
        accessible.add(index); queue.push([nc, nr]);
      }
    }
    for (let index = 0; index < tiles.length; index++) if (tiles[index] === 1 && !accessible.has(index)) tiles[index] = 0;
    const room = { version: 2, name: scene.asset, cellSize: 16, cols, rows,
      backgroundWidth: image.readUInt32BE(16), backgroundHeight: image.readUInt32BE(20),
      backgroundFile: 'background.png', tiles, objects, furniture: [], tileset: [] };
    await fs.writeFile(new URL(`${scene.asset}.room.json`, output), JSON.stringify(room, null, 2) + '\n');
    const zip = new JSZip(), date = new Date('2026-10-02T00:00:00Z');
    zip.file('room.json', JSON.stringify(room), { date });
    zip.file('background.png', image, { date });
    await fs.writeFile(new URL(`${scene.asset}.zip`, output), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    console.log(`${scene.zhName}：${map.work.length} 个工位，${map.rest.length} 个休息位。`);
  }
  manifest.push({ id: scene.id, theme: scene.theme, name: scene.name, description: scene.description,
    file: `${scene.asset}.zip`, thumbnail: `${scene.asset}.png` });
}
// Publish the complete library only after every scene package is ready.
await fs.writeFile(new URL('index.json', output), JSON.stringify(manifest, null, 2) + '\n');
console.log(`场景库已生成：${manifest.length} 种主题。`);
