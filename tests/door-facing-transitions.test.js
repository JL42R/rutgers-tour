import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PlayerControls } from '../src/controls.js';
import { allowsDoorTransition } from '../src/door-transition-policy.js';
import { room116ExitStop, ROOM116_EXIT_CLEARANCE } from '../src/room116-door-stop.js';
import { room116ArrivalPosition } from '../src/room116-arrival.js';
import { createRoom116Boundary, isRoom116PositionAllowed, room116Coordinates } from '../src/room116-boundary.js';

const config = JSON.parse(readFileSync(new URL('../public/zones.json', import.meta.url)));
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
// Execute the production switch functions AND frame decision, not a copied policy loop.
const switching = main.slice(main.indexOf('let zoneSwitchInProgress = false;'), main.indexOf('// --- Frame loop ---'));
const frame = main.slice(main.indexOf('  const dt = Math.min(clock.getDelta()'), main.indexOf('  roomNavigation.update(camera.position'));
const makeLoop = new Function('zones', 'npcs', 'controls', 'console', 'room116ArrivalPosition',
  'allowsDoorTransition', 'room116ExitStop', 'camera', 'clock', `${switching}\nreturn { frame() {${frame}\n}, switching: () => zoneSwitchInProgress };`);
const active = config.zones.flatMap(zone => zone.transitions.map(door => ({ zone, door })));
const signOf = door => door.direction === 'positive' ? 1 : -1;
const yawOf = door => door.axis === 'x' ? -signOf(door) * Math.PI / 2 : door.direction === 'positive' ? Math.PI : 0;
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup(zone, door, { keys = ['KeyW'], yaw = yawOf(door), enabled = true, dt = .05, deferred = false } = {}) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.65, 0);
  camera.position[door.axis] = door.plane - signOf(door) * .005;
  camera.position[door.axis === 'x' ? 'z' : 'x'] = (door.range[0] + door.range[1]) / 2;
  const controls = Object.assign(Object.create(PlayerControls.prototype), {
    camera, enabled, keys: new Set(keys), yaw, pitch: .3,
  });
  let release;
  const wait = deferred ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const calls = [], replacements = [];
  const zones = {
    current: zone,
    getCollisionBoxes() { return this.current.collision ?? []; },
    async loadZone(id) {
      calls.push(id); await wait;
      this.current = config.zones.find(candidate => candidate.id === id) ?? { id, transitions: [], collision: [] };
      return this.current;
    },
  };
  const log = { info() {}, warn(message) { assert.fail(message); }, error(error) { assert.fail(String(error)); } };
  const loop = makeLoop(zones, { setNPCs(list, id) { replacements.push(id); } }, controls, log,
    room116ArrivalPosition, allowsDoorTransition, room116ExitStop, camera, { getDelta: () => dt });
  return { camera, controls, zones, calls, replacements, loop, release };
}
function expectedOrientation(c) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(c.pitch, c.yaw, 0, 'YXZ'));
}

for (const { zone, door } of active) {
  const label = `${zone.id} -> ${door.target}`;
  for (const keys of [['KeyW'], ['ArrowUp'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD']]) {
    test(`${label}: actual controls allow ${keys} and preserve arrival/orientation`, async () => {
      for (const dt of [1 / 60, .05]) {
        const s = setup(zone, door, { keys, dt });
        const raw = Object.assign(Object.create(PlayerControls.prototype), {
          camera: s.camera.clone(), keys: new Set(keys), enabled: true, yaw: s.controls.yaw, pitch: s.controls.pitch,
        });
        raw.update(dt, zone.collision, zone);
        s.loop.frame(); await flush();
        assert.deepEqual(s.calls, [door.target]);
        assert.deepEqual(s.replacements, [door.target]);
        const target = config.zones.find(candidate => candidate.id === door.target);
        const arrival = zone.id === 'hallway' && target.id === 'project-studio'
          ? room116ArrivalPosition(raw.camera.position, target) : raw.camera.position;
        assert(Math.hypot(s.camera.position.x - arrival.x, s.camera.position.z - arrival.z) < 1e-12);
        assert.equal(s.camera.position.y, 1.65);
        assert(s.camera.quaternion.equals(expectedOrientation(s.controls)));
        if (target.id === 'project-studio') {
          const boundary = createRoom116Boundary(target);
          assert(isRoom116PositionAllowed(s.camera.position, boundary));
          assert(Math.abs(room116Coordinates(s.camera.position, boundary).forward - .6) < 1e-12);
        }
      }
    });
  }
  const rejectionCases = [
    ['backward S', ['KeyS'], Math.PI], ['backward Down', ['ArrowDown'], Math.PI],
    ['sideways D', ['KeyD'], Math.PI / 2], ['sideways A', ['KeyA'], -Math.PI / 2],
    ['cancelled W/S with strafe', ['KeyW', 'KeyS', 'KeyD'], Math.PI / 2],
    ['mixed aliases with strafe', ['ArrowUp', 'KeyS', 'ArrowRight'], Math.PI / 2],
    ['outside facing cone', ['KeyW'], 61 * Math.PI / 180],
  ];
  for (const [name, keys, angle] of rejectionCases) {
    test(`${label}: rejects ${name}, rolls back only X/Z, then accepts W`, async () => {
      const s = setup(zone, door, { keys, yaw: yawOf(door) + angle });
      const before = s.camera.position.clone();
      // Confirm the rejected request really crosses geometrically with the production controls.
      const probe = Object.assign(Object.create(PlayerControls.prototype), {
        camera: s.camera.clone(), keys: new Set(keys), enabled: true, yaw: s.controls.yaw, pitch: s.controls.pitch,
      });
      probe.update(.05, zone.collision, zone);
      assert(signOf(door) * (probe.camera.position[door.axis] - door.plane) > 0);
      s.loop.frame(); await flush();
      if (zone.id === 'project-studio') {
        // D3 now stops earlier in the room basis, retaining tangential travel.
        const boundary = createRoom116Boundary(zone);
        assert(Math.abs(room116Coordinates(s.camera.position, boundary).forward
          - room116Coordinates(before, boundary).forward) < 1e-12);
        assert(isRoom116PositionAllowed(s.camera.position, boundary));
        assert.equal(s.camera.position.y, before.y);
      } else {
        assert(s.camera.position.equals(before));
      }
      assert(s.camera.quaternion.equals(expectedOrientation(s.controls)));
      assert.equal(s.controls.yaw, yawOf(door) + angle);
      assert.equal(s.controls.pitch, .3);
      assert.deepEqual(s.calls, []); assert.deepEqual(s.replacements, []);
      assert.equal(s.zones.current, zone); assert.equal(s.loop.switching(), false);
      s.controls.yaw = yawOf(door); s.controls.keys = new Set(['KeyW']);
      s.loop.frame(); await flush(); assert.deepEqual(s.calls, [door.target]);
    });
  }
  test(`${label}: stationary rotation, opposing input and dialogue-disabled controls never load`, async () => {
    for (const keys of [[], ['KeyW', 'KeyS'], ['KeyW', 'ArrowDown'], ['ArrowUp', 'KeyS']]) {
      const s = setup(zone, door, { keys }); const before = s.camera.position.clone();
      for (let i = 0; i < 8; i++) { s.controls.yaw += Math.PI / 4; s.loop.frame(); }
      await flush(); assert(s.camera.position.equals(before)); assert.deepEqual(s.calls, []);
    }
    const s = setup(zone, door, { enabled: false });
    const before = s.camera.position.clone(); s.loop.frame(); await flush();
    assert(s.camera.position.equals(before)); assert.deepEqual(s.calls, []);
  });
  test(`${label}: pending load freezes movement and prevents duplicate loads`, async () => {
    const s = setup(zone, door, { deferred: true }); s.loop.frame();
    assert(s.loop.switching()); assert.equal(s.controls.enabled, false);
    const crossing = s.camera.position.clone();
    for (let i = 0; i < 10; i++) s.loop.frame();
    assert(s.camera.position.equals(crossing)); assert.deepEqual(s.calls, [door.target]);
    s.release(); await flush();
    assert.equal(s.loop.switching(), false); assert.equal(s.controls.enabled, true);
    s.controls.keys.clear(); s.loop.frame(); assert.equal(s.calls.length, 1);
  });
}

for (const direction of ['positive', 'negative']) {
  test(`synthetic ${direction} Z crossing uses production frame and controls`, async () => {
    const door = { axis: 'z', direction, plane: 0, range: [-1, 1], target: 'synthetic-target' };
    const zone = { id: 'synthetic-source', transitions: [door], collision: [] };
    const s = setup(zone, door); s.loop.frame(); await flush(); assert.deepEqual(s.calls, [door.target]);
    const backward = setup(zone, door, { yaw: yawOf(door) + Math.PI, keys: ['KeyS'] });
    const before = backward.camera.position.clone(); backward.loop.frame(); await flush();
    assert(backward.camera.position.equals(before)); assert.deepEqual(backward.calls, []);
  });
}

test('collision-blocked W and collision-induced sideways sliding cannot load a zone', async () => {
  const door = { axis: 'x', direction: 'positive', plane: 0, range: [-1, 1], target: 'synthetic-target' };
  // Expanded box begins at X=0: attempted normal movement is blocked, Z can slide.
  const zone = { id: 'synthetic-source', transitions: [door], collision: [{ min: [.35, 0, -2], max: [1, 3, 2] }] };
  for (const keys of [['KeyW'], ['KeyW', 'KeyD']]) {
    const s = setup(zone, door, { keys }); const before = s.camera.position.clone();
    s.loop.frame(); await flush();
    assert.equal(s.camera.position.x, before.x); assert.deepEqual(s.calls, []);
    if (keys.length === 2) assert.notEqual(s.camera.position.z, before.z);
  }
});

test('collision sliding across a door preserves aligned motion and rejects outside-cone motion', async () => {
  const door = { axis: 'x', direction: 'positive', plane: 0, range: [-1, 1], target: 'synthetic-target' };
  const zone = { id: 'synthetic-source', transitions: [door], collision: [{ min: [-2, 0, -.39], max: [2, 3, -.35] }] };
  const s = setup(zone, door, { yaw: -Math.PI / 2 + 55 * Math.PI / 180 });
  const before = s.camera.position.clone();
  // A wall cancels Z, leaving X travel. With a 55-degree facing offset this remains allowed.
  s.loop.frame(); await flush(); assert.deepEqual(s.calls, [door.target]);
  assert.equal(s.camera.position.z, before.z);
  // For a 60.1-degree offset the surviving X travel falls outside the facing cone.
  const rejected = setup(zone, door, { yaw: -Math.PI / 2 + 60.1 * Math.PI / 180 });
  const original = rejected.camera.position.clone(); rejected.loop.frame(); await flush();
  assert(rejected.camera.position.equals(original)); assert.deepEqual(rejected.calls, []);
});

for (const roomId of ['printing-room', 'project-studio']) {
  test(`${roomId}: 20 forward entry/return crossings preserve arrival and prevent stationary loops`, async () => {
    const hall = config.zones.find(zone => zone.id === 'hallway');
    const entry = hall.transitions.find(door => door.target === roomId);
    const s = setup(hall, entry);
    for (let i = 0; i < 20; i++) {
      const door = s.zones.current.transitions.find(door => door.target === (s.zones.current.id === 'hallway' ? roomId : 'hallway'));
      s.controls.keys = new Set(['KeyW']); s.controls.yaw = yawOf(door);
      for (let frame = 0, calls = s.calls.length; s.calls.length === calls && frame < 30; frame++) s.loop.frame();
      await flush(); assert.equal(s.calls.length, i + 1);
      s.controls.keys.clear(); const before = s.camera.position.clone();
      for (let frame = 0; frame < 5; frame++) { s.controls.yaw += .2; s.loop.frame(); }
      assert.equal(s.calls.length, i + 1); assert(s.camera.position.equals(before));
    }
    assert.equal(s.zones.current.id, 'hallway');
  });
}

const studio = config.zones.find(zone => zone.id === 'project-studio');
const exit = studio.transitions.find(door => door.target === 'hallway');
const boundary = createRoom116Boundary(studio);
for (const [label, keys, angle] of [
  ['backward', ['KeyS'], Math.PI], ['sideways right', ['KeyD'], Math.PI / 2],
  ['sideways left', ['KeyA'], -Math.PI / 2], ['backward diagonal', ['KeyS', 'KeyD'], Math.PI],
]) {
  test(`D3 room-side stop: ${label}, lateral motion, recovery and forward exit`, async () => {
    for (const dt of [1 / 60, .05]) {
      const s = setup(studio, exit, { keys, yaw: yawOf(exit) + angle, dt });
      const arrival = room116ArrivalPosition(s.camera.position, studio);
      s.camera.position.x = arrival.x; s.camera.position.z = arrival.z;
      const start = s.camera.position.clone();
      for (let i = 0; i < (dt === .05 ? 6 : 15); i++) {
        s.loop.frame();
        assert(room116Coordinates(s.camera.position, boundary).forward >= boundary.minForward + ROOM116_EXIT_CLEARANCE - 1e-10);
        assert(isRoom116PositionAllowed(s.camera.position, boundary));
      }
      assert.deepEqual(s.calls, []);
      const local = room116Coordinates(s.camera.position, boundary);
      assert(Math.abs(local.forward - .4) < 1e-10);
      if (label === 'backward diagonal') {
        assert(Math.abs(local.left - room116Coordinates(start, boundary).left) > .1);
      }
      assert.equal(s.camera.position.y, start.y);
      assert(s.camera.quaternion.equals(expectedOrientation(s.controls)));
      // Standing and rotating at the stop do not load or move the player.
      s.controls.keys.clear(); const stopped = s.camera.position.clone();
      s.controls.yaw += .2; s.loop.frame(); assert(s.camera.position.equals(stopped));
      // Inward movement is free, then turning toward the hallway permits exit.
      s.controls.yaw = yawOf(exit) + Math.PI; s.controls.keys = new Set(['KeyW']);
      s.loop.frame(); assert(room116Coordinates(s.camera.position, boundary).forward > .4);
      s.controls.yaw = yawOf(exit);
      for (let i = 0; i < 30 && !s.calls.length; i++) s.loop.frame();
      await flush(); assert.deepEqual(s.calls, ['hallway']);
    }
  });
}

test('D3 conditional stop uses one radius plus clearance, keeps valid edge positions and never snaps corridor starts', () => {
  assert.equal(boundary.minForward, .35);
  assert(Math.abs(boundary.minForward + ROOM116_EXIT_CLEARANCE - .4) < 1e-12);
  for (const z of [exit.range[0], (exit.range[0] + exit.range[1]) / 2, exit.range[1]]) {
    const nearPlane = { x: exit.plane + .005, z };
    const arrival = room116ArrivalPosition(nearPlane, studio);
    for (const previous of [arrival, nearPlane]) {
      const requested = { x: previous.x - .11, z: previous.z };
      const stopped = room116ExitStop({ zone: studio, boundary, previous, current: requested,
        movementEnabled: true, keys: new Set(['KeyS']), yaw: -Math.PI / 2 });
      assert(isRoom116PositionAllowed(stopped, boundary));
      const oldForward = room116Coordinates(previous, boundary).forward;
      const newForward = room116Coordinates(stopped, boundary).forward;
      assert(newForward >= Math.min(oldForward, .4) - 1e-10);
      assert(newForward <= oldForward + 1e-10);
      assert(Math.hypot(stopped.x - previous.x, stopped.z - previous.z) <= .11 + 1e-10);
    }
  }
});

test('D3 stop leaves other zones and inward/parallel movement unchanged', () => {
  const previous = room116ArrivalPosition({ x: exit.plane + .005, z: 17 }, studio);
  for (const current of [previous, { x: previous.x + .1, z: previous.z },
    { x: previous.x + boundary.left.x * .1, z: previous.z + boundary.left.z * .1 }]) {
    assert.equal(room116ExitStop({ zone: studio, boundary, previous, current,
      movementEnabled: true, keys: new Set(['KeyS']), yaw: 0 }), current);
  }
  const current = { x: previous.x - .5, z: previous.z };
  for (const zone of config.zones.filter(zone => zone.id !== 'project-studio')) {
    assert.equal(room116ExitStop({ zone, boundary, previous, current,
      movementEnabled: true, keys: new Set(['KeyS']), yaw: 0 }), current);
  }
});
