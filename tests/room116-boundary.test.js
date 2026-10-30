import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { PLAYER_RADIUS, resolveMovement } from '../src/collision.js';
import { PlayerControls } from '../src/controls.js';
import {
  createRoom116Boundary, room116Coordinates, isRoom116PositionAllowed, resolveRoom116Movement,
} from '../src/room116-boundary.js';

const config = JSON.parse(fs.readFileSync(new URL('../public/zones.json', import.meta.url)));
// Keep every Stage 8B assertion against its original outer-boundary fixture.
// Stage 9B's separate suite exercises the actual production exclusions and their integration.
delete config.zones.find(z => z.id === 'project-studio').walkingBoundary.exclusions;
const room = config.zones.find(z => z.id === 'project-studio');
const hallway = config.zones.find(z => z.id === 'hallway');
const printing = config.zones.find(z => z.id === 'printing-room');
const b = createRoom116Boundary(room);
const near = (actual, expected, tolerance = 1e-8) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const distance = (a, c) => Math.hypot(a.x - c.x, a.z - c.z);
const localPoint = (d, w) => ({ x: b.origin.x + b.forward.x * d + b.left.x * w, z: b.origin.z + b.forward.z * d + b.left.z * w });
const localStep = (d, w) => ({ x: b.forward.x * d + b.left.x * w, z: b.forward.z * d + b.left.z * w });
function move(position, step) {
  const next = resolveRoom116Movement(position, step, b);
  assert(isRoom116PositionAllowed(next, b), `Invalid result ${JSON.stringify({ position, step, next, local: room116Coordinates(next, b) })}`);
  assert(distance(position, next) <= Math.hypot(step.x, step.z) + 1e-8, 'Movement snapped farther than the requested step');
  return next;
}
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const switchSource = main.slice(main.indexOf('let zoneSwitchInProgress = false;'), main.indexOf('// --- Frame loop ---'));
const createSwitchLogic = new Function('zones', 'npcs', 'controls', 'console', `${switchSource}\nreturn { switchZone, crossedTransition, switching: () => zoneSwitchInProgress };`);
const crossed = createSwitchLogic({}, {}, {}, console).crossedTransition;
const controlsFor = () => Object.assign(Object.create(PlayerControls.prototype), {
  camera: new THREE.PerspectiveCamera(70, 16 / 9, .05, 200),
  enabled: true, keys: new Set(['KeyW']), yaw: 0, pitch: -.1,
});

test('approved geometry: exact dimensions, orthogonal basis, all four world corners and physical anchors', () => {
  near(b.width, 6.096); near(b.depth, 11.049);
  near(Math.hypot(b.forward.x, b.forward.z), 1, 1e-14);
  near(Math.hypot(b.left.x, b.left.z), 1, 1e-14);
  near(b.forward.x * b.left.x + b.forward.z * b.left.z, 0, 1e-14);
  for (const [d, w, expected] of [
    [0, 0, [1.1679567381989318, 22.17181860228656]],
    [0, 6.096, [1.2825898215842069, 16.07689651449958]],
    [11.049, 0, [12.21500302231283, 22.379591065922373]],
    [11.049, 6.096, [12.329636105698105, 16.284668978135393]],
  ]) { const p = localPoint(d, w); near(p.x, expected[0], 1e-12); near(p.z, expected[1], 1e-12); }
  const rightWall = room116Coordinates({ x: 1.1263932391224838, z: 22.171036877436464 }, b);
  const threshold = room116Coordinates({ x: 1.2642833297509717, z: 17.050233688457247 }, b);
  near(rightWall.left, 0, 1e-12); near(threshold.forward, 0, 1e-12);
});

test('configuration is explicitly Room 116-only and rejects malformed geometry/apertures', () => {
  assert.throws(() => createRoom116Boundary(hallway));
  assert.throws(() => createRoom116Boundary({ ...room, id: 'printing-room' }));
  for (const alter of [
    z => { z.walkingBoundary.width += .1; },
    z => { z.walkingBoundary.farLeft[0] += .1; },
    z => { z.walkingBoundary.doorway.openingZ[0] += .1; },
    z => { z.walkingBoundary.doorway.transitionId = 'missing'; },
  ]) { const zone = structuredClone(room); alter(zone); assert.throws(() => createRoom116Boundary(zone)); }
});

test('one shared 0.35 m radius, applied exactly once to all solid faces', () => {
  assert.equal(PLAYER_RADIUS, .35);
  assert.equal(b.radius, PLAYER_RADIUS);
  near(b.minLeft, .35); near(b.maxLeft, 5.746); near(b.minForward, .35); near(b.maxForward, 10.699);
  for (const [d, w, dd, dw, axis, expected] of [
    [5, .36, 0, -.11, 'left', .35], [5, 5.736, 0, .11, 'left', 5.746],
    [10.689, 2, .11, 0, 'forward', 10.699], [.36, 2, -.11, 0, 'forward', .35],
  ]) near(room116Coordinates(move(localPoint(d, w), localStep(dd, dw)), b)[axis], expected);
});

test('unobstructed forward/back/strafe/diagonal steps preserve requested world motion and input object', () => {
  for (let k = 0; k < 32; k++) {
    const p = localPoint(5, 3), original = { ...p };
    const step = { x: Math.cos(k * Math.PI / 16) * .11, z: Math.sin(k * Math.PI / 16) * .11 };
    const next = move(p, step);
    near(next.x, p.x + step.x, 1e-12); near(next.z, p.z + step.z, 1e-12);
    assert.deepEqual(p, original);
  }
});

test('all solid walls stop repeated normal movement, including the entrance outside D3', () => {
  for (const [d, w, dd, dw, axis, expected] of [
    [4, 1, 0, -.11, 'left', b.minLeft], [4, 4, 0, .11, 'left', b.maxLeft],
    [8, 3, .11, 0, 'forward', b.maxForward], [2, 2, -.11, 0, 'forward', b.minForward],
    [2, 5.73, -.11, 0, 'forward', b.minForward],
  ]) {
    let p = localPoint(d, w);
    for (let n = 0; n < 160; n++) p = move(p, localStep(dd, dw));
    near(room116Coordinates(p, b)[axis], expected);
  }
});

test('side-wall sliding is smooth in both directions at near/middle/far depth', () => {
  for (const d of [1.5, 5.5, 9]) for (const side of ['right', 'left']) for (const direction of [-1, 1]) {
    const w = side === 'right' ? b.minLeft : b.maxLeft;
    let p = localPoint(d, w);
    for (let n = 0; n < 7; n++) p = move(p, localStep(direction * .11 / Math.SQRT2, (side === 'right' ? -1 : 1) * .11 / Math.SQRT2));
    const actual = room116Coordinates(p, b);
    near(actual.forward, d + direction * 7 * .11 / Math.SQRT2);
    near(actual.left, w);
  }
});

test('former Stage 8 artificial-joint counterexamples now slide instead of trapping', () => {
  for (const [side, x, z] of [
    ['right', 3.3991311188845814, 21.85643734622586], ['right', 7.0814798802558805, 21.925694834104466],
    ['right', 10.763828641627178, 21.994952321983067], ['left', 2.7337642022698563, 16.461535258438882],
    ['left', 6.416112963641156, 16.530792746317488], ['left', 10.098461725012456, 16.60005023419609],
  ]) {
    let p = { x, z }; const start = room116Coordinates(p, b);
    const sign = side === 'right' ? -1 : 1;
    for (let n = 0; n < 10; n++) p = move(p, localStep(sign * .11 / Math.SQRT2, sign * .11 / Math.SQRT2));
    near(room116Coordinates(p, b).forward, start.forward + sign * 10 * .11 / Math.SQRT2);
  }
});

test('front/back parallel movement and diagonal sliding remain smooth', () => {
  for (const d of [b.minForward, b.maxForward]) for (const direction of [-1, 1]) {
    let p = localPoint(d, 2.5);
    for (let n = 0; n < 10; n++) p = move(p, localStep(d === b.minForward ? -.05 : .05, direction * .05));
    near(room116Coordinates(p, b).forward, d);
    near(room116Coordinates(p, b).left, 2.5 + direction * .5);
  }
});

test('all four physical corners stop outward motion and permit backing out immediately', () => {
  for (const d of [b.minForward, b.maxForward]) for (const w of [b.minLeft, b.maxLeft]) {
    const p = localPoint(d, w), dd = d === b.minForward ? -.07 : .07, dw = w === b.minLeft ? -.07 : .07;
    const stopped = move(p, localStep(dd, dw));
    near(distance(p, stopped), 0);
    const escaped = move(stopped, localStep(-dd, -dw));
    near(distance(stopped, escaped), Math.hypot(dd, dw));
  }
});

test('D3 plane and every radius-safe edge position remain reachable without entry snapping', () => {
  assert.equal(b.portalPlaneX, 1.2642833297509717);
  assert.equal(b.portalMinZ, 16.505667581697203); assert.equal(b.portalMaxZ, 17.573909531203245);
  for (let i = 0; i <= 16; i++) {
    const z = b.portalMinZ + (b.portalMaxZ - b.portalMinZ) * i / 16;
    let p = { x: b.portalPlaneX + .01, z };
    assert(isRoom116PositionAllowed(p, b));
    near(distance(p, move(p, { x: 0, z: 0 })), 0);
    for (let n = 0; n < 7; n++) p = move(p, { x: .11, z: 0 });
    for (let n = 0; n < 8; n++) p = move(p, { x: -.11, z: 0 });
    assert(p.x < b.portalPlaneX);
    near(p.z, z, 1e-12);
  }
});

test('portal jambs block lateral escape, and release normally into the room', () => {
  for (const sign of [-1, 1]) {
    let p = { x: b.portalPlaneX + .08, z: (b.portalMinZ + b.portalMaxZ) / 2 };
    for (let n = 0; n < 20; n++) p = move(p, { x: 0, z: sign * .11 });
    assert.equal(p.z, sign < 0 ? b.portalMinZ : b.portalMaxZ);
    for (let n = 0; n < 6; n++) p = move(p, { x: .11, z: 0 });
    const next = move(p, { x: 0, z: sign * .05 });
    near(next.z - p.z, sign * .05);
  }
});

test('all extrema of the maximum-step post-D3 entry corridor are valid with no correction', () => {
  for (const x of [b.portalPlaneX + 1e-9, b.portalPlaneX + 2.2 * .05]) {
    for (const z of [b.portalMinZ, b.portalMaxZ]) {
      const p = { x, z };
      assert(isRoom116PositionAllowed(p, b));
      assert.deepEqual(move(p, { x: 0, z: 0 }), p);
      const forward = move(p, { x: .11, z: 0 });
      near(forward.x - p.x, .11, 1e-12);
    }
  }
});

test('aperture corner crossings are swept: a diagonal cannot tunnel through the solid entrance', () => {
  for (const sign of [-1, 1]) {
    const z = sign < 0 ? b.portalMinZ - .04 : b.portalMaxZ + .04;
    const d = .37, x = b.origin.x + (d - b.forward.z * (z - b.origin.z)) / b.forward.x;
    let p = { x, z };
    const next = move(p, { x: -.10, z: -sign * .08 });
    assert(isRoom116PositionAllowed(next, b));
    // Standing at the real doorway corner can move diagonally into the aperture.
    const edgeZ = sign < 0 ? b.portalMinZ : b.portalMaxZ;
    const edgeX = b.origin.x + (b.minForward - b.forward.z * (edgeZ - b.origin.z)) / b.forward.x;
    p = { x: edgeX, z: edgeZ };
    const intoPortal = move(p, { x: -.05, z: -sign * .02 });
    assert(room116Coordinates(intoPortal, b).forward < b.minForward);
  }
});

test('no tunneling at maximum normal timestep or even oversized non-portal movement', () => {
  for (const [d, w, dd, dw] of [[5, .36, 0, -100], [5, 5.736, 0, 100], [10.689, 2, 100, 0], [.36, 2, -100, 0]]) {
    const p = move(localPoint(d, w), localStep(dd, dw));
    assert(isRoom116PositionAllowed(p, b));
    const local = room116Coordinates(p, b);
    assert(local.forward >= b.minForward - 1e-8 && local.forward <= b.maxForward + 1e-8);
  }
});

test('invalid external spawns are never teleported into the rectangle', () => {
  const p = localPoint(2, -2);
  assert(!isRoom116PositionAllowed(p, b));
  assert.deepEqual(resolveRoom116Movement(p, { x: .11, z: 0 }, b), p);
});

test('randomized boundary/aperture movements stay valid and never jump farther than the input', () => {
  let seed = 116;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 30000; i++) {
    let p;
    if (i % 2) {
      const z = b.portalMinZ - .15 + random() * (b.portalMaxZ - b.portalMinZ + .30);
      const d = -.11 + random() * .6;
      p = { x: b.origin.x + (d - b.forward.z * (z - b.origin.z)) / b.forward.x, z };
      if (!isRoom116PositionAllowed(p, b)) continue;
    } else {
      p = localPoint(b.minForward + random() * (b.maxForward - b.minForward), b.minLeft + random() * (b.maxLeft - b.minLeft));
    }
    const angle = random() * 2 * Math.PI, length = random() * .11;
    move(p, { x: Math.cos(angle) * length, z: Math.sin(angle) * length });
  }
});

test('hallway/printing/other zones and the original two-argument API retain exact AABB results', () => {
  for (const zone of [hallway, printing, { ...printing, walkingBoundary: room.walkingBoundary }, null]) {
    const boxes = zone?.collision ?? hallway.collision;
    for (const [x, z] of [[0, 0], [.70, 10], [0, 17], [-1.5, 5.675], [-4.20, 2]]) for (const yaw of [0, .3, Math.PI / 2, Math.PI]) {
      const controls = controlsFor(); controls.camera.position.set(x, 1.65, z); controls.yaw = yaw;
      const step = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0)).multiplyScalar(2.2 * .05);
      const expected = resolveMovement(controls.camera.position, step, boxes);
      controls.update(.05, boxes, zone);
      assert.equal(controls.camera.position.x, expected.x); assert.equal(controls.camera.position.z, expected.z);
      assert.equal(controls.camera.position.y, 1.65);
    }
  }
});

test('actual controls route only configured Project Studio through the oriented solver', () => {
  const controls = controlsFor(), p = localPoint(5, b.minLeft + .01);
  controls.camera.position.set(p.x, 1.65, p.z);
  const step = localStep(0, -.11);
  controls.yaw = Math.atan2(-step.x, -step.z);
  controls.update(.05, [], room);
  near(room116Coordinates(controls.camera.position, b).left, b.minLeft);
  assert.equal(controls.camera.position.y, 1.65);
});

test('actual controls and unchanged switch logic preserve D3 position/facing over repeated edge entries', async () => {
  for (const dt of [1 / 60, .05]) for (const z of [b.portalMinZ, b.portalMinZ + 1e-7, (b.portalMinZ + b.portalMaxZ) / 2, b.portalMaxZ - 1e-7, b.portalMaxZ]) {
    const controls = controlsFor(); controls.camera.position.set(0, 1.65, z);
    const zones = { current: hallway, async loadZone(id) { await Promise.resolve(); this.current = config.zones.find(z => z.id === id); return this.current; } };
    const logic = createSwitchLogic(zones, { setNPCs() {} }, controls, { info() {}, error(...args) { throw Error(args.join(' ')); } });
    let count = 0;
    async function walk(targetX, expectedZone) {
      controls.yaw = targetX > controls.camera.position.x ? -Math.PI / 2 : Math.PI / 2;
      for (let frame = 0; frame < 600 && Math.abs(controls.camera.position.x - targetX) > 2.2 * dt; frame++) {
        const previous = controls.camera.position.clone();
        controls.update(dt, zones.current.collision, zones.current);
        const transition = zones.current.transitions.find(t => logic.crossedTransition(previous, controls.camera.position, t));
        if (transition) {
          const position = controls.camera.position.clone(), facing = controls.camera.quaternion.clone();
          const pending = logic.switchZone(transition.target);
          assert.equal(controls.enabled, false);
          await logic.switchZone(transition.target); await pending;
          assert(position.equals(controls.camera.position)); assert(facing.equals(controls.camera.quaternion));
          assert.equal(controls.enabled, true); count++;
          if (zones.current.id === 'project-studio') assert(isRoom116PositionAllowed(controls.camera.position, b));
          else for (const box of zones.current.collision) {
            const p = controls.camera.position;
            assert(!(p.x > box.min[0] - PLAYER_RADIUS && p.x < box.max[0] + PLAYER_RADIUS
              && p.z > box.min[2] - PLAYER_RADIUS && p.z < box.max[2] + PLAYER_RADIUS), 'Preserved return camera overlaps a hallway collider');
          }
          assert(!zones.current.transitions.some(t => logic.crossedTransition(controls.camera.position, controls.camera.position, t)));
        }
        assert.equal(controls.camera.position.y, 1.65);
      }
      assert.equal(zones.current.id, expectedZone);
      assert(Math.abs(controls.camera.position.x - targetX) <= 2.2 * dt + 1e-8, 'D3 movement trapped');
    }
    for (let i = 0; i < 5; i++) { await walk(2.5, 'project-studio'); await walk(0, 'hallway'); }
    assert.equal(count, 10);
  }
});

test('D1 still crosses both ways with actual controls and unchanged printing collisions', () => {
  for (const dt of [1 / 60, .05]) {
    const controls = controlsFor(); controls.camera.position.set(0, 1.65, 5.675);
    let zone = hallway, crossings = 0;
    for (let repeat = 0; repeat < 5; repeat++) for (const [target, id] of [[-1.5, 'printing-room'], [0, 'hallway']]) {
      controls.yaw = target < controls.camera.position.x ? Math.PI / 2 : -Math.PI / 2;
      for (let frame = 0; frame < 500 && Math.abs(controls.camera.position.x - target) > 2.2 * dt; frame++) {
        const previous = controls.camera.position.clone(); controls.update(dt, zone.collision, zone);
        const transition = zone.transitions.find(t => crossed(previous, controls.camera.position, t));
        if (transition) { zone = config.zones.find(z => z.id === transition.target); crossings++; }
      }
      assert.equal(zone.id, id); assert(Math.abs(controls.camera.position.x - target) <= 2.2 * dt + 1e-8);
    }
    assert.equal(crossings, 10);
  }
});
