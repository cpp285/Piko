import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OfficeState } from '../../apps/web/src/components/office/engine/officeState';
import { FURNITURE_CATALOG, getCatalogEntry } from '../../apps/web/src/components/office/layout/furnitureCatalog';
import { findPath } from '../../apps/web/src/components/office/layout/tileMap';
import type { OfficeLayout } from '../../apps/web/src/components/office/types';

const room = JSON.parse(fs.readFileSync(new URL('../../apps/web/public/offices/garden-studio.room.json', import.meta.url), 'utf8'));
assert.equal(room.tiles.length, room.cols * room.rows);
assert.equal(room.backgroundWidth, room.backgroundHeight);
const orientations = ['front', 'right', 'back', 'left'] as const;
for (const type of ['desk', 'chair']) {
  const base = getCatalogEntry(type)!;
  assert.ok(base);
  for (const orientation of orientations) if (!getCatalogEntry(`${type}-${orientation}`)) {
    FURNITURE_CATALOG.push({ ...base, type: `${type}-${orientation}`, orientation, footprintW: 1, footprintH: 1 });
  }
}
const layout: OfficeLayout = { version: 1, cols: room.cols, rows: room.rows, tiles: room.tiles,
  furniture: room.objects.map((object: { id: string; type: string; col: number; row: number; rotation: number }) => ({ uid: object.id, type: `${object.type}-${orientations[object.rotation / 90]}`, col: object.col, row: object.row })),
};
const office = new OfficeState(layout);
const seats = [...office.seats.values()];
assert.equal(seats.filter(seat => !seat.isRest).length, 9, 'all nine work desks must pair with real chairs');
assert.equal(seats.filter(seat => seat.isRest).length, 9, 'discussion, reading and coffee seats must remain rest seats');
const blocked = new Set(office.blockedTiles);
for (const seat of seats) blocked.delete(`${seat.seatCol},${seat.seatRow}`);
for (const seat of seats) {
  assert.equal(room.tiles[seat.seatRow * room.cols + seat.seatCol], 1, `seat ${seat.uid} must be on floor`);
  const ownSeatUnblocked = new Set(office.blockedTiles);
  ownSeatUnblocked.delete(`${seat.seatCol},${seat.seatRow}`);
  assert.ok(findPath(31, 59, seat.seatCol, seat.seatRow, office.tileMap, ownSeatUnblocked).length, `entry must reach ${seat.uid}`);
}
assert.equal(findPath(31, 59, 31, 27, office.tileMap, blocked).length, 0, 'characters must never walk into the central garden');
const destinations = office.walkableTiles.filter(tile => tile.col < 23 || tile.col > 40);
for (const destination of destinations) assert.ok(findPath(31, 59, destination.col, destination.row, office.tileMap, blocked).length, `walkable tile ${destination.col},${destination.row} must not be trapped`);
for (let index = 0; index < 9; index++) {
  office.addCharacter(`scene-check-${index}`, `成员 ${index}`, index % 6);
  office.updateCharacterStatus(`scene-check-${index}`, "working");
}
assert.equal(new Set([...office.characters.values()].map(character => character.seatId)).size, 9);
console.log(`场景验收通过：${seats.length} 个座位、${office.walkableTiles.length} 个可行走格、9 位成员分配到不同工位。`);

const preview = new OfficeState(layout);
let wakeCount = 0;
preview.onDirty = () => { wakeCount++; };
preview.spawnTestCharacters();
assert.equal(preview.characters.size, 9);
assert.equal(wakeCount, 1, 'adding preview members wakes a sleeping renderer');
preview.clearTestCharacters();
assert.equal(preview.characters.size, 0);
assert.equal(wakeCount, 2, 'clearing preview members wakes a sleeping renderer');
