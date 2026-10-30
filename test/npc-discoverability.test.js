import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { NPCManager } from '../src/npc.js';

const config = JSON.parse(fs.readFileSync(new URL('../public/zones.json', import.meta.url)));
function setup(t, { failImages = false } = {}) {
  const originalDocument = globalThis.document;
  const handlers = new Map();
  const prompt = { style: {} };
  globalThis.document = {
    getElementById: () => prompt,
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
  const manager = new NPCManager(new THREE.Scene(), dialogue);
  return { manager, dialogue, prompt, handlers };
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
  const { manager, dialogue, prompt, handlers } = setup(t);
  const npc = { id: 'sample', name: 'Guide', position: [0, 1.6, 0], radius: 2 };
  manager.setNPCs([npc]);
  manager.update({ x: 1.999, z: 0 });
  assert.equal(prompt.style.display, 'block');
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
  const { manager, dialogue, handlers, prompt } = setup(t);
  manager.setNPCs([{ id: 'sample', name: 'Guide', position: [0, 1.6, 0], radius: 2 }]);
  dialogue.isOpen = true;
  manager.update({ x: 0, z: 0 });
  assert.equal(prompt.style.display, 'none');
  handlers.get('keydown')({ code: 'KeyE' });
  assert.equal(dialogue.started, undefined);
});
test('all three current zone configurations preserve NPC data and positions', t => {
  const { manager, prompt } = setup(t);
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
    }
  }
  assert.equal(JSON.stringify(config), snapshot);
});
