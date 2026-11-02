import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { directionAngle, connectedRooms, hallwayWaypoint, RoomRoute, RoomNavigation } from '../src/room-navigation.js';
import { resolveMovement } from '../src/collision.js';

const config = JSON.parse(readFileSync(new URL('../public/zones.json', import.meta.url)));
const hallway = config.zones.find(zone => zone.id === 'hallway');
const origin = { x: 0, z: 0 };
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('arrow follows camera yaw for forward, right, left, behind and full rotations', () => {
  near(directionAngle(origin, { x: 0, z: -1 }), 0);
  near(directionAngle(origin, { x: 1, z: 0 }), Math.PI / 2);
  near(directionAngle(origin, { x: -1, z: 0 }), -Math.PI / 2);
  near(Math.abs(directionAngle(origin, { x: 0, z: 1 })), Math.PI);
  near(directionAngle(origin, { x: 0, z: 1 }, Math.PI), 0);
  near(directionAngle(origin, { x: 1, z: 0 }, -Math.PI / 2), 0);
  near(directionAngle(origin, { x: 0, z: -1 }, 4 * Math.PI), 0);
});

test('available destinations and labels come from reciprocal configured connections', () => {
  const rooms = connectedRooms(config);
  assert.deepEqual(rooms.map(room => room.id), ['printing-room', 'project-studio']);
  for (const room of rooms) assert.equal(room.label, config.zones.find(zone => zone.id === room.id).label);
  const changed = structuredClone(config);
  changed.zones.push({ id: 'future-room', label: 'Future room', transitions: [{ target: 'hallway' }] });
  changed.zones.find(zone => zone.id === 'hallway').transitions.push({
    target: 'future-room', axis: 'z', plane: 10, range: [2, 4], direction: 'positive',
  });
  assert.equal(connectedRooms(changed).length, 3);
  changed.zones.at(-1).transitions = [];
  assert.equal(connectedRooms(changed).length, 2);
});

test('both routes align along hallway before turning through the doorway', () => {
  for (const { door } of connectedRooms(config)) {
    const middle = (door.range[0] + door.range[1]) / 2;
    assert.deepEqual(hallwayWaypoint(origin, door, hallway), { x: 0, z: middle });
    assert.deepEqual(hallwayWaypoint({ x: 0.6, z: middle + 1 }, door, hallway), { x: 0, z: middle });
    const target = hallwayWaypoint({ x: 0, z: middle }, door, hallway);
    assert.equal(target.z, middle);
    assert.equal(Math.sign(target.x - door.plane), door.direction === 'positive' ? 1 : -1);
    // The final turn remains inside the configured radius-safe doorway range.
    assert(target.z > door.range[0] && target.z < door.range[1]);
  }
});

test('waypoints adapt to moved doors, shifted hallway spine and Z-axis transitions', () => {
  const door = { axis: 'z', plane: 12, range: [3, 5], direction: 'negative' };
  assert.deepEqual(hallwayWaypoint(origin, door, { spawn: [0, 0, 8] }), { z: 8, x: 4 });
  assert.deepEqual(hallwayWaypoint({ x: 4, z: 8 }, door, hallway), { z: 11.55, x: 4 });
});

test('following both waypoint routes clears actual hallway walls from either end', () => {
  for (const { door } of connectedRooms(config)) {
    for (const startZ of [-19, 18.4]) {
      let position = { x: 0.6, y: 1.65, z: startZ };
      let crossed = false;
      for (let step = 0; step < 1000; step++) {
        const target = hallwayWaypoint(position, door, hallway);
        const dx = target.x - position.x, dz = target.z - position.z;
        const distance = Math.hypot(dx, dz);
        const next = resolveMovement(position, { x: dx / distance * 0.05, y: 0, z: dz / distance * 0.05 }, hallway.collision);
        crossed = door.direction === 'positive' ? next.x > door.plane : next.x < door.plane;
        position = next;
        if (crossed) break;
      }
      assert(crossed, `route stuck: ${door.target} from ${startZ}`);
      assert(position.z >= door.range[0] && position.z <= door.range[1]);
    }
  }
});

test('selection, change, cancellation, wrong-room pause, resume and actual arrival', () => {
  const route = new RoomRoute(config);
  assert.equal(route.destination, null);
  route.select('printing-room');
  assert(route.waypoint(origin, 'hallway'));
  assert.equal(route.enter('project-studio'), false);
  assert.equal(route.destination.id, 'printing-room');
  assert.equal(route.waypoint(origin, 'project-studio'), null);
  assert(route.waypoint(origin, 'hallway'));
  route.select('project-studio');
  assert.equal(route.enter('project-studio'), true);
  assert.equal(route.destination, null);
  route.select('printing-room'); route.cancel();
  assert.equal(route.waypoint(origin, 'hallway'), null);
  route.select('not-a-room'); assert.equal(route.destination, null);
});

test('selector lifecycle freezes controls, supports exploration and restores optional control', t => {
  const previous = globalThis.document;
  const elements = new Map();
  function element() {
    return { hidden: false, open: false, children: [], style: {}, handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      get firstElementChild() { return this.children[0]; },
      focus() { document.activeElement = this; }, contains(el) { return this.children.includes(el); },
      showModal() { this.open = true; }, close() { this.open = false; this.handlers.close(); },
    };
  }
  globalThis.document = { activeElement: null, getElementById(id) {
    if (!elements.has(id)) elements.set(id, element()); return elements.get(id);
  }, createElement: element };
  t.after(() => { globalThis.document = previous; });
  const controls = { enabled: true, keys: new Set(['KeyW']), unlock() { this.unlocked = true; } };
  const dialogue = { isOpen: false };
  const ui = new RoomNavigation({ controls, dialogue, tracker: { collapse() {} } });
  ui.configure(config);
  ui.open(); assert(ui.isOpen); assert.equal(controls.enabled, false); assert.equal(controls.keys.size, 0);
  assert(controls.unlocked); assert.equal(document.activeElement, ui.choices.children[0]);
  ui.choices.children[0].handlers.click(); assert(ui.active); assert.equal(controls.enabled, true);
  ui.update(origin, Math.PI, 'hallway', false); assert.equal(ui.indicator.hidden, false);
  ui.update(origin, 0, 'project-studio', false); assert.equal(ui.arrow.hidden, true); assert(ui.active);
  ui.update(origin, 0, 'printing-room', false); assert.equal(ui.active, false);
  ui.open(); ui.route.select('printing-room');
  elements.get('room-explore').handlers.click(); assert.equal(ui.active, false); assert.equal(ui.isOpen, false);
  ui.open(); ui.selector.close(); assert.equal(controls.enabled, true); // native Escape closes the dialog
  assert.equal(document.activeElement, ui.openButton);
  dialogue.isOpen = true; ui.open(); assert.equal(ui.isOpen, false);
});
