import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { NPCManager } from '../src/npc.js';
import { RoomRoute } from '../src/room-navigation.js';

const config = JSON.parse(fs.readFileSync(new URL('../public/zones.json', import.meta.url)));

test('destination guidance suppresses only NPC arrow; modal also blocks E and prompt', t => {
  const { manager, handlers, dialogue, direction, prompt } = setup(t);
  manager.setNPCs([{ id: 'test-guide', name: 'Guide', position: [0, 1.6, -5], radius: 2 }]);
  manager.isDirectionSuppressed = () => true;
  manager.update({ x: 0, z: 0 }); assert.equal(direction.hidden, true);
  manager.isDirectionSuppressed = () => false;
  manager.update({ x: 0, z: 0 }); assert.equal(direction.hidden, false);
  manager.isInteractionBlocked = () => true;
  manager.update({ x: 0, z: -4 }); assert.equal(prompt.style.display, 'none');
  handlers.get('keydown')({ code: 'KeyE' }); assert.equal(dialogue.started, undefined);
  manager.isInteractionBlocked = () => false;
  manager.update({ x: 0, z: -4 });
  handlers.get('keydown')({ code: 'KeyE' }); assert.equal(dialogue.started.id, 'test-guide');
});
function trackedText() {
  let value = '';
  return {
    writes: 0,
    get textContent() { return value; },
    set textContent(next) { value = next; this.writes++; },
  };
}
function trackedStyle() {
  let transform = '';
  return {
    transformWrites: 0,
    get transform() { return transform; },
    set transform(next) { transform = next; this.transformWrites++; },
  };
}
function setup(t, { failImages = false, completedNpcIds = new Set() } = {}) {
  const originalDocument = globalThis.document;
  const handlers = new Map();
  const prompt = { style: {} };
  const direction = { hidden: true };
  const directionArrow = { style: trackedStyle() };
  const directionName = trackedText();
  const directionDistance = trackedText();
  const elements = new Map([
    ['interact-prompt', prompt],
    ['guide-direction', direction],
    ['guide-direction-arrow', directionArrow],
    ['guide-direction-name', directionName],
    ['guide-direction-distance', directionDistance],
  ]);
  globalThis.document = {
    getElementById: (id) => elements.get(id),
    addEventListener: (type, handler) => handlers.set(type, handler),
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ beginPath() {}, arc() {}, fill() {}, stroke() {}, fillText() {} })
    })
  };
  t.after(() => { globalThis.document = originalDocument; });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(THREE.TextureLoader.prototype, 'load', (url, loaded, progress, failed) => {
    if (failImages) failed(new Error('Expected image failure'));
    else loaded(new THREE.Texture());
  });
  const dialogue = { isOpen: false, start(npc) { this.started = npc; } };
  const manager = new NPCManager(new THREE.Scene(), dialogue, {
    isCompleted: (npcId) => completedNpcIds.has(npcId),
  });
  return {
    manager, dialogue, prompt, handlers, completedNpcIds,
    direction, directionArrow, directionName, directionDistance,
  };
}
test('hint explains markers/E and preserves movement, mouse-look and Escape', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const hint = html.match(/<div id="hint">([\s\S]*?)<\/div>/)[1];
  assert.match(hint, /approach.*guide marker.*<strong>E<\/strong>/i);
  for (const text of ['WASD', 'mouse', 'Esc']) assert(hint.includes(text));
  assert.doesNotMatch(hint, /guide portraits identify/i);
});
test('distance scaling stays bounded and preserves the intended near/far policy', t => {
  const { manager } = setup(t);
  manager.setNPCs([{ id: 'sample', name: 'Guide', position: [0, 1.6, 0], radius: 2 }]);
  for (const [distance, size] of [[0, .32], [2, .40], [3.25, .45], [8.25, .65], [100, .65]]) {
    manager.update({ x: distance, z: 0 });
    assert(Math.abs(manager.npcs[0].sprite.scale.x - size) < 1e-10);
    assert.deepEqual(manager.npcs[0].sprite.scale.toArray(), [size, size, size]);
  }
});
test('scaling does not expand the strict interaction radius or change E selection', t => {
  const { manager, dialogue, prompt, handlers, direction } = setup(t);
  const npc = { id: 'sample', name: 'Guide', position: [0, 1.6, 0], radius: 2 };
  manager.setNPCs([npc]);
  manager.update({ x: 1.999, z: 0 });
  assert.equal(prompt.style.display, 'block');
  assert.equal(direction.hidden, true);
  handlers.get('keydown')({ code: 'KeyE' });
  assert.equal(dialogue.started, npc);
  dialogue.started = null;
  manager.update({ x: 2, z: 0 });
  assert.equal(manager.nearest, null);
  assert.equal(prompt.style.display, 'none');
  handlers.get('keydown')({ code: 'KeyE' });
  assert.equal(dialogue.started, null);
});
test('nearest guide wins regardless of differing sprite scales', t => {
  const { manager } = setup(t);
  manager.setNPCs([
    { id: 'near', name: 'Near', position: [0, 1.6, 0], radius: 2 },
    { id: 'far', name: 'Far', position: [1.5, 1.6, 0], radius: 2 }
  ]);
  manager.update({ x: .2, z: 0 });
  assert.equal(manager.nearest.data.id, 'near');
  assert(manager.npcs[1].sprite.scale.x > manager.npcs[0].sprite.scale.x);
});
test('failed Vishan image preserves the badge and depth testing', t => {
  const { manager } = setup(t, { failImages: true });
  const npc = config.zones.find(z => z.id === 'printing-room').npcs.find(n => n.id === 'vishan-ergonomics');
  manager.setNPCs([npc]);
  manager.update({ x: npc.position[0] + 10, z: npc.position[2] });
  assert.equal(manager.npcs[0].sprite.material.map.isCanvasTexture, true);
  assert.equal(manager.npcs[0].sprite.material.depthTest, true);
  assert.equal(manager.npcs[0].sprite.scale.x, .65);
});
test('successful portrait loading retains color space and normal occlusion', t => {
  const { manager } = setup(t);
  manager.setNPCs([config.zones.find(z => z.id === 'printing-room').npcs[0]]);
  const sprite = manager.npcs[0].sprite;
  assert.equal(sprite.material.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(sprite.material.depthTest, true);
});
test('open dialogue suppresses prompts and E re-entry', t => {
  const { manager, dialogue, handlers, prompt, direction } = setup(t);
  manager.setNPCs([{ id: 'sample', name: 'Guide', position: [0, 1.6, 0], radius: 2 }]);
  dialogue.isOpen = true;
  manager.update({ x: 0, z: 0 });
  assert.equal(prompt.style.display, 'none');
  assert.equal(direction.hidden, true);
  handlers.get('keydown')({ code: 'KeyE' });
  assert.equal(dialogue.started, undefined);
});
test('all three current zone configurations preserve NPC data and positions', t => {
  const { manager, prompt, direction } = setup(t);
  const snapshot = JSON.stringify(config);
  for (const zone of config.zones) {
    manager.setNPCs(zone.npcs);
    manager.update({ x: 0, z: 0 });
    assert.equal(manager.npcs.length, zone.npcs.length);
    manager.npcs.forEach((npc, i) => {
      assert.equal(npc.sprite.position.x, zone.npcs[i].position[0]);
      assert.equal(npc.sprite.position.z, zone.npcs[i].position[2]);
    });
    if (!zone.npcs.length) {
      assert.equal(manager.nearest, null);
      assert.equal(prompt.style.display, 'none');
      assert.equal(direction.hidden, true);
    }
  }
  assert.equal(JSON.stringify(config), snapshot);
});

test('indicator points toward the first unfinished guide using camera-relative yaw', t => {
  const completedNpcIds = new Set(['completed-nearby']);
  const {
    manager, direction, directionArrow, directionName, directionDistance,
  } = setup(t, { completedNpcIds });
  manager.setNPCs([
    { id: 'completed-nearby', name: 'Completed', position: [0, 1.6, -3], radius: 2 },
    { id: 'next-guide', name: 'Guide', trackerLabel: 'Next Station', position: [5, 1.6, 0], radius: 2 },
    { id: 'far-guide', name: 'Far', position: [0, 1.6, -8], radius: 2 },
  ]);

  manager.update({ x: 0, z: 0 }, 0);
  assert.equal(direction.hidden, false);
  assert.equal(directionName.textContent, 'Next Station');
  assert.equal(directionDistance.textContent, '5 m');
  assert.equal(directionArrow.style.transform, `rotate(${Math.PI / 2}rad)`);

  manager.update({ x: 0, z: 0 }, -Math.PI / 2);
  assert.equal(directionArrow.style.transform, 'rotate(0rad)');
});

test('checklist target stays first even beside another guide; E still talks to the nearest', t => {
  const { manager, direction, directionName, handlers, dialogue, prompt, completedNpcIds } = setup(t);
  manager.setNPCs([
    { id: 'first', name: 'First', position: [0, 1.6, -9], radius: 2 },
    { id: 'closer', name: 'Closer', position: [0, 1.6, -1], radius: 2 },
  ]);
  manager.update({ x: 0, z: 0 });
  assert.equal(directionName.textContent, 'First');
  assert.equal(direction.hidden, false);
  assert.equal(prompt.style.display, 'block');
  handlers.get('keydown')({ code: 'KeyE' }); assert.equal(dialogue.started.id, 'closer');
  completedNpcIds.add('closer');
  manager.update({ x: 0, z: 0 }); assert.equal(directionName.textContent, 'First');
  manager.update({ x: 0, z: -8 }); assert.equal(direction.hidden, true);
  assert.equal(prompt.style.display, 'block');
  manager.isInteractionBlocked = () => true;
  manager.update({ x: 0, z: 0 }); assert.equal(direction.hidden, true);
});

test('manual room route keeps priority until cancel or arrival; blocking UI and dialogue hide NPC guidance', t => {
  const { manager, direction, dialogue } = setup(t);
  const route = new RoomRoute(config);
  let modalOpen = false;
  manager.setNPCs([{ id: 'first', name: 'First', position: [0, 1.6, -9] }]);
  manager.isDirectionSuppressed = () => !!route.destination || modalOpen;
  manager.isInteractionBlocked = () => modalOpen;
  const update = () => manager.update({ x: 0, z: 0 });
  update(); assert.equal(direction.hidden, false);
  route.select('project-studio'); update(); assert.equal(direction.hidden, true);
  route.enter('printing-room'); update(); assert.equal(direction.hidden, true);
  route.cancel(); update(); assert.equal(direction.hidden, false);
  route.select('project-studio'); route.enter('project-studio'); update(); assert.equal(direction.hidden, false);
  modalOpen = true; update(); assert.equal(direction.hidden, true);
  modalOpen = false; dialogue.isOpen = true; update(); assert.equal(direction.hidden, true);
  dialogue.isOpen = false; update(); assert.equal(direction.hidden, false);
});

test('hallway keeps E interaction without an NPC arrow and rejects stale foreign-room targets', t => {
  const { manager, direction, prompt, handlers, dialogue } = setup(t);
  manager.setNPCs([{ id: 'hallway-guide', name: 'CORE Guide', position: [0, 1.6, -3] }], 'hallway');
  manager.update({ x: 0, z: 0 }); assert.equal(direction.hidden, true);
  manager.update({ x: 0, z: -2 }); assert.equal(prompt.style.display, 'block');
  handlers.get('keydown')({ code: 'KeyE' }); assert.equal(dialogue.started.id, 'hallway-guide');
  manager.setNPCs([{ id: 'local', name: 'Local', position: [0, 1.6, -8] }], 'printing-room');
  manager.getGuidance = () => ({ id: 'foreign', label: 'Foreign', position: { x: 9, z: 9 }, radius: 2 });
  manager.update({ x: 0, z: 0 }); assert.equal(direction.hidden, true);
});

test('indicator advances through completion state and returns after progress reset', t => {
  const completedNpcIds = new Set();
  const { manager, direction, directionName } = setup(t, { completedNpcIds });
  manager.setNPCs([
    { id: 'first', name: 'First', position: [3, 1.6, 0], radius: 2 },
    { id: 'second', name: 'Second', position: [5, 1.6, 0], radius: 2 },
  ]);

  manager.update({ x: 0, z: 0 });
  assert.equal(directionName.textContent, 'First');

  completedNpcIds.add('first');
  manager.update({ x: 0, z: 0 });
  assert.equal(directionName.textContent, 'Second');

  completedNpcIds.add('second');
  manager.update({ x: 0, z: 0 });
  assert.equal(direction.hidden, true);

  completedNpcIds.clear();
  manager.update({ x: 0, z: 0 });
  assert.equal(direction.hidden, false);
  assert.equal(directionName.textContent, 'First');
});

test('indicator updates only DOM values that actually changed', t => {
  const { manager, directionArrow, directionName, directionDistance } = setup(t);
  manager.setNPCs([
    { id: 'guide', name: 'Guide', trackerLabel: 'Stable Station', position: [5, 1.6, 0] },
  ]);

  manager.update({ x: 0, z: 0 }, 0);
  assert.equal(directionName.writes, 1);
  assert.equal(directionDistance.writes, 1);
  assert.equal(directionArrow.style.transformWrites, 1);

  manager.update({ x: 0, z: 0 }, 0);
  assert.equal(directionName.writes, 1);
  assert.equal(directionDistance.writes, 1);
  assert.equal(directionArrow.style.transformWrites, 1);

  manager.update({ x: .6, z: 0 }, 0);
  assert.equal(directionName.writes, 1);
  assert.equal(directionDistance.writes, 2);
  assert.equal(directionArrow.style.transformWrites, 1);

  manager.update({ x: .6, z: 0 }, .1);
  assert.equal(directionName.writes, 1);
  assert.equal(directionDistance.writes, 2);
  assert.equal(directionArrow.style.transformWrites, 2);
});

test('zone NPC replacement immediately updates or hides the current target', t => {
  const { manager, direction, directionName } = setup(t);

  manager.setNPCs([{ id: 'zone-a', name: 'Zone A Guide', position: [4, 1.6, 0] }]);
  manager.update({ x: 0, z: 0 });
  assert.equal(direction.hidden, false);
  assert.equal(directionName.textContent, 'Zone A Guide');

  manager.setNPCs([{ id: 'zone-b', name: 'Zone B Guide', position: [0, 1.6, -4] }]);
  manager.update({ x: 0, z: 0 });
  assert.equal(direction.hidden, false);
  assert.equal(directionName.textContent, 'Zone B Guide');

  manager.setNPCs([]);
  manager.update({ x: 0, z: 0 });
  assert.equal(direction.hidden, true);
});
