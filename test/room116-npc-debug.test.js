import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installRoom116NPCDebug } from '../src/room116-npc-debug.js';

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
  assert.deepEqual(sample.position, [x, y, z]);
  assert.deepEqual([sample.x, sample.y, sample.z], [x, y, z]);
  assert.equal(sample.yawDegrees, 270);
  assert.equal(sample.allowed, true);
  assert.equal(sample.provisional, true);
  assert.deepEqual(camera.position, { x, y, z });
  dispose(); assert.equal(handlers.size, 0);
});
