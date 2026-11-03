import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installRoom116NPCDebug } from '../src/room116-npc-debug.js';
import { createRoom116Boundary, isRoom116PositionAllowed } from '../src/room116-boundary.js';
import { cameraOffset, createRoom116Placement } from '../src/room116-npc-editor.js';

test('placement math follows yaw only and rejects edits outside Room 116', () => {
  const position = { x: 2, y: 1.65, z: 3 };
  assert.deepEqual(cameraOffset(position, 0, 1), [2, 1.65, 2]);
  assert.deepEqual(cameraOffset(position, Math.PI / 2, 1), [1, 1.65, 3]);
  assert.deepEqual(cameraOffset(position, 0, 0, 1), [3, 1.65, 3]);
  const zones = { current: { id: 'printing-room', npcs: [{ id: 'room116-project-1', position: [1, 2, 3] }] } };
  const before = structuredClone(zones);
  const editor = createRoom116Placement({ camera: { position }, controls: { yaw: 0 }, zones,
    npcs: { setNPCs() { assert.fail('Must not replace another room markers'); } } });
  assert.equal(editor.place('room116-project-1', 1), false);
  assert.equal(editor.nudge('room116-project-1', 1, 0), false);
  assert.equal(editor.restore('room116-project-1'), false);
  assert.deepEqual(zones, before);
});

test('Room 116 recorder is opt-in, zone-scoped, safe during UI use, and records world coordinates', () => {
  const config = JSON.parse(readFileSync(new URL('../public/zones.json', import.meta.url)));
  const studio = config.zones.find(z => z.id === 'project-studio');
  const [x, y, z] = studio.npcs[0].position;
  const camera = { position: { x, y, z } }, controls = { enabled: true, yaw: -Math.PI / 2 };
  const zones = { current: studio }, dialogue = { isOpen: false };
  const handlers = new Map(), logs = [];
  const target = { addEventListener: (key, value) => handlers.set(key, value),
    removeEventListener: key => handlers.delete(key) };
  const options = { camera, controls, zones, dialogue, target, log: (...args) => logs.push(args) };
  for (const search of ['', '?debugRoom116NPCs=0', '?debugEquipment=1', '?debugRoom116NPCs']) {
    installRoom116NPCDebug({ ...options, search });
    assert.equal(handlers.size, 0);
  }
  const dispose = installRoom116NPCDebug({ ...options, search: '?debugRoom116NPCs=1&debugEquipment=1' });
  const record = handlers.get('keydown');
  const key = { code: 'KeyP' };
  for (const event of [{ code: 'KeyE' }, { ...key, repeat: true }, { ...key, ctrlKey: true },
    { ...key, altKey: true }, { ...key, metaKey: true }, { ...key, shiftKey: true },
    { ...key, isComposing: true }, { ...key, target: { isContentEditable: true } },
    { ...key, target: { closest: () => ({}) } }]) record(event);
  dialogue.isOpen = true; record(key); dialogue.isOpen = false;
  controls.enabled = false; record(key); controls.enabled = true;
  zones.current = config.zones[0]; record(key); zones.current = studio;
  assert.equal(logs.length, 1); // Only startup instructions so far.
  record(key);
  const sample = JSON.parse(logs[1][1]);
  assert.equal(sample.zone, studio.id);
  assert.deepEqual(sample.position, [x, y, z].map(value => Number(value.toFixed(6))));
  assert.deepEqual([sample.x, sample.y, sample.z], sample.position);
  assert.equal(sample.yawDegrees, 270);
  assert.equal(sample.allowed, isRoom116PositionAllowed({ x, z }, createRoom116Boundary(studio)));
  assert.equal(sample.provisional, true);
  assert.deepEqual(camera.position, { x, y, z });
  dispose(); assert.equal(handlers.size, 0);
});
