import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const JSZip = require('jszip');
const output = new URL('../../apps/web/public/offices/', import.meta.url);
const image = await fs.readFile(new URL('garden-studio.png', output));
const cols = 64, rows = 64;
const tiles = Array(cols * rows).fill(8);
const paint = (left, top, right, bottom, value = 0) => {
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) tiles[row * cols + col] = value;
};
// All furniture bounds are authored against the new image; none reuse the previous map.
paint(3, 9, 60, 50, 1);
paint(22, 51, 41, 53, 1);
paint(27, 54, 36, 60, 1);
// Window seating, coffee counter, perimeter plants and cabinets.
paint(10, 9, 16, 9);
paint(46, 9, 57, 12);
paint(3, 9, 5, 11);
paint(3, 14, 4, 16);
paint(3, 19, 4, 23);
paint(3, 25, 4, 31);
paint(59, 9, 60, 14);
paint(59, 29, 60, 32);
// Central garden and its two benches: a continuous route stays open around it.
paint(23, 16, 40, 35);
// Six western desks. Chair positions stay on floor tiles.
for (const top of [17, 24]) for (const left of [5, 10, 15]) paint(left, top, left + 4, top + 2);
// Discussion area and surrounding planters.
paint(44, 17, 45, 28);
paint(58, 17, 59, 28);
paint(50, 21, 54, 25);
// Reading nook: an opening above the right divider connects it to the main aisle.
paint(3, 34, 10, 35);
paint(3, 37, 5, 44);
paint(11, 37, 18, 40);
paint(7, 42, 17, 45);
paint(7, 46, 10, 49);
paint(12, 46, 15, 48);
paint(21, 41, 21, 50);
paint(3, 47, 5, 50);
paint(11, 44, 11, 45, 1);
paint(16, 44, 16, 45, 1);
// Southern work area, low shelf, divider and plants.
paint(44, 38, 52, 39);
paint(41, 39, 42, 45);
paint(59, 38, 60, 45);
for (const left of [43, 48, 53]) paint(left, 40, left + 4, 42);
const objects = [];
const marker = (id, type, col, row, rotation = 0) => objects.push({ id: `obj-garden-${id}`, type, col, row, rotation });
for (const [band, deskRow, chairRow] of [['north', 19, 21], ['west', 26, 28]]) {
  for (const [index, col] of [7, 12, 17].entries()) {
    marker(`${band}-desk-${index}`, 'desk', col, deskRow);
    marker(`${band}-chair-${index}`, 'chair', col, chairRow);
  }
}
for (const [index, col] of [45, 50, 55].entries()) {
  marker(`south-desk-${index}`, 'desk', col, 42);
  marker(`south-chair-${index}`, 'chair', col, 44);
}
for (const [id, col, row, rotation] of [
  ['meeting-north', 52, 20, 0], ['meeting-west', 49, 24, 90],
  ['meeting-east', 55, 24, 270], ['meeting-south', 52, 27, 180],
  ['reading-a', 11, 44, 0], ['reading-b', 16, 44, 0],
  ['coffee-a', 49, 13, 180], ['coffee-b', 52, 13, 180], ['coffee-c', 55, 13, 180],
]) marker(id, 'chair', col, row, rotation);
// Remove tiny enclosed floor pockets so idle members cannot spawn behind furniture.
const accessible = new Set(['31,59']);
const queue = [[31, 59]];
for (let head = 0; head < queue.length; head++) {
  const [col, row] = queue[head];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = col + dc, nr = row + dr, key = `${nc},${nr}`;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || tiles[nr * cols + nc] !== 1 || accessible.has(key)) continue;
    accessible.add(key); queue.push([nc, nr]);
  }
}
for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
  if (tiles[row * cols + col] === 1 && !accessible.has(`${col},${row}`)) tiles[row * cols + col] = 0;
}
const room = { version: 2, name: 'garden-studio', cellSize: 16, cols, rows,
  backgroundWidth: image.readUInt32BE(16), backgroundHeight: image.readUInt32BE(20),
  backgroundFile: 'background.png', tiles, objects, furniture: [], tileset: [] };
await fs.writeFile(new URL('garden-studio.room.json', output), JSON.stringify(room, null, 2) + '\n');
const zip = new JSZip();
const date = new Date('2026-10-02T00:00:00Z');
zip.file('room.json', JSON.stringify(room), { date });
zip.file('background.png', image, { date });
await fs.writeFile(new URL('garden-studio.zip', output), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`花园工作室：${cols}×${rows}，9 个工位，9 个休息位。`);
