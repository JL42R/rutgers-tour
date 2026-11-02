import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { npcGuidance } from '../src/npc-guidance.js';
import { firstUnfinishedNPCInZone } from '../src/interaction-tracker.js';
import { directionAngle } from '../src/room-navigation.js';

const config = JSON.parse(readFileSync(new URL('../public/zones.json', import.meta.url)));
const hallway = config.zones.find(zone => zone.id === 'hallway');
const printing = config.zones.find(zone => zone.id === 'printing-room');
const studio = config.zones.find(zone => zone.id === 'project-studio');
const next = (zoneId, completed = new Set(), zones = config.zones) =>
  firstUnfinishedNPCInZone(zones, zoneId, id => completed.has(id));

test('hallway never gets NPC directions, including toward its own unfinished guide', () => {
  assert.equal(npcGuidance(next(hallway.id), hallway), null);
  assert.equal(npcGuidance(next(printing.id), hallway), null);
});

test('room guidance resolves its own checklist target and camera-relative direction', () => {
  const result = npcGuidance(next(printing.id), printing);
  assert.deepEqual(result.position, { x: printing.npcs[0].position[0], z: printing.npcs[0].position[2] });
  assert.equal(result.label, printing.npcs[0].trackerLabel);
  assert.equal(result.radius, printing.npcs[0].radius);
  assert.equal(result.via, undefined);
  const position = { x: result.position.x - 5, z: result.position.z };
  assert.equal(directionAngle(position, result.position), Math.PI / 2);
  assert.equal(directionAngle(position, result.position, -Math.PI / 2), 0);
});

test('all cross-zone targets are rejected even with configured doorway connections', () => {
  assert.equal(npcGuidance(next(hallway.id), printing), null);
  assert.equal(npcGuidance(next(printing.id), studio), null);
  assert.equal(npcGuidance(next(hallway.id), studio), null);
});

test('empty, missing, fully completed and invalid room targets produce no guidance', () => {
  assert.equal(next(studio.id), null);
  assert.equal(next('missing'), null);
  assert.equal(next(undefined), null);
  const completed = new Set(printing.npcs.map(npc => npc.id));
  assert.equal(next(printing.id, completed), null);
  assert.equal(npcGuidance(next(printing.id, completed), printing), null);
  assert(next(hallway.id, completed)); // Global progress still has an unfinished guide.
  assert.equal(npcGuidance(null, studio), null);
  assert.equal(npcGuidance(next(printing.id), null), null);
  assert.equal(npcGuidance({ zoneId: printing.id, npcId: 'missing' }, printing), null);
});

test('future Project Studio guides use only their room checklist order', () => {
  const future = { ...studio, npcs: [
    { id: 'studio-first', trackerLabel: 'First station', position: [10, 1.6, 20] },
    { id: 'studio-near', trackerLabel: 'Near station', position: [2, 1.6, 17] },
  ] };
  const zones = [...config.zones.filter(zone => zone.id !== studio.id), future];
  const first = next(studio.id, new Set(), zones);
  assert.equal(first.npcId, 'studio-first');
  assert.equal(npcGuidance(first, future).id, 'studio-first');
  assert.equal(npcGuidance(first, printing), null);
  const completed = new Set(['studio-first']);
  assert.equal(next(studio.id, completed, zones).npcId, 'studio-near');
  completed.add('studio-near');
  assert.equal(next(studio.id, completed, zones), null);
  assert.equal(next(printing.id, completed, zones).npcId, 'johnny-bambu');
});
