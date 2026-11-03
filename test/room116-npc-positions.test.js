import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { room116NpcApproaches } from '../test-support/room116-npc-approaches.js';

test('saved Room 116 coordinates are exact, unique, reloadable and interactable from D3', () => {
  const load = () => JSON.parse(readFileSync(new URL('../public/zones.json', import.meta.url)));
  const config = load(), studio = config.zones.find(zone => zone.id === 'project-studio');
  const expected = [
    [2.9760467734269613, 1.75, 16.30298825508666],
    [6.498525114733146, 1.65, 15.627480887419985],
    [10.696601570542061, 1.65, 14.787731603294203],
    [12.665069684308186, 1.65, 17.297893383059034],
    [11.359993907018975, 1.75, 20.47323220715301],
    [2.9601283961821645, 1.65, 19.289295604117655],
  ];
  const ids = config.zones.flatMap(zone => zone.npcs.map(npc => npc.id));
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, 12);
  assert.equal(studio.npcs.length, 6);
  studio.npcs.forEach((npc, index) => {
    assert.equal(npc.id, `room116-project-${index + 1}`);
    assert.deepEqual(npc.position, expected[index]);
  });
  assert.deepEqual(load().zones.find(zone => zone.id === studio.id).npcs, studio.npcs);
  const approaches = room116NpcApproaches(studio);
  assert.equal(approaches.size, 6);
  for (const npc of studio.npcs) assert(approaches.get(npc.id).distance < npc.radius);
});
