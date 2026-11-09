import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { allowsDoorTransition } from '../src/door-transition-policy.js';

const directions = [
  ['x', 'positive', -Math.PI / 2], ['x', 'negative', Math.PI / 2],
  ['z', 'positive', Math.PI], ['z', 'negative', 0],
];
for (const [axis, direction, yaw] of directions) {
  const sign = direction === 'positive' ? 1 : -1;
  const normal = { x: axis === 'x' ? sign : 0, z: axis === 'z' ? sign : 0 };
  const base = {
    transition: { axis, direction }, movementEnabled: true, keys: new Set(['KeyW']), yaw,
    previous: { x: 0, z: 0 }, current: normal,
  };
  const allows = overrides => allowsDoorTransition({ ...base, ...overrides });
  test(`${direction} ${axis}: forward vector matches Three.js controls convention`, () => {
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
    assert(Math.hypot(forward.x - normal.x, forward.z - normal.z) < 1e-12);
  });
  for (const keys of [['KeyW'], ['ArrowUp'], ['KeyW', 'ArrowUp'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD']]) {
    test(`${direction} ${axis}: permits forward intent ${keys}`, () => {
      assert(allows({ keys: new Set(keys) }));
    });
  }
  for (const keys of [[], ['KeyS'], ['ArrowDown'], ['KeyA'], ['KeyD'], ['KeyW', 'KeyS'],
    ['KeyW', 'ArrowDown'], ['ArrowUp', 'KeyS'], ['ArrowUp', 'ArrowDown'],
    ['KeyW', 'KeyS', 'KeyD'], ['KeyW', 'ArrowUp', 'KeyS', 'ArrowRight']]) {
    test(`${direction} ${axis}: rejects non-forward/cancelled intent ${keys}`, () => {
      assert.equal(allows({ keys: new Set(keys) }), false);
    });
  }
  test(`${direction} ${axis}: inclusive facing threshold and pitch-independent ground direction`, () => {
    for (const side of [-1, 1]) {
      for (const degrees of [59.9, 60]) assert(allows({ yaw: yaw + side * degrees * Math.PI / 180 }));
      assert.equal(allows({ yaw: yaw + side * 60.1 * Math.PI / 180 }), false);
    }
  });
  test(`${direction} ${axis}: zero displacement, disabled movement and invalid numeric input reject`, () => {
    assert.equal(allows({ current: base.previous }), false);
    assert.equal(allows({ movementEnabled: false }), false);
    assert.equal(allows({ current: { x: NaN, z: 0 } }), false);
    assert.equal(allows({ yaw: Infinity }), false);
    assert.equal(allows({ transition: { axis: 'y', direction } }), false);
    assert.equal(allows({ transition: { axis, direction: 'unknown' } }), false);
  });
  test(`${direction} ${axis}: actual travel must align with both destination and facing`, () => {
    assert.equal(allows({ current: { x: -normal.x, z: -normal.z } }), false);
    assert.equal(allows({ current: { x: normal.z, z: -normal.x } }), false);
    // Facing and travel each fit the door cone but are 100 degrees apart.
    const angle = 50 * Math.PI / 180;
    const travel = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw - angle, 0));
    assert.equal(allows({ yaw: yaw + angle, current: travel }), false);
    for (const degrees of [59.9, 60, 60.1]) {
      const movement = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw + degrees * Math.PI / 180, 0));
      assert.equal(allows({ current: movement }), degrees <= 60);
    }
  });
}
