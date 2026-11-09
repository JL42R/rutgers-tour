// Eligibility only: geometric crossing and collision resolution stay with their callers.
const MIN_ALIGNMENT = Math.cos(Math.PI / 3); // 60 degrees, including diagonal approaches.
const EPSILON = 1e-10;

export function allowsDoorTransition({ transition, movementEnabled, keys, yaw, previous, current }) {
  if (!movementEnabled || !Number.isFinite(yaw)) return false;
  // Match controls.js: aliases are ORed before opposing directions cancel.
  const forwardInput = Number(keys.has('KeyW') || keys.has('ArrowUp'))
    - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  if (forwardInput <= 0) return false;
  if (!['x', 'z'].includes(transition.axis)
    || !['positive', 'negative'].includes(transition.direction)) return false;

  const sign = transition.direction === 'positive' ? 1 : -1;
  const normal = { x: transition.axis === 'x' ? sign : 0, z: transition.axis === 'z' ? sign : 0 };
  // controls.js rotates local -Z by yaw; pitch never changes ground-plane movement.
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const dx = current.x - previous.x, dz = current.z - previous.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance <= EPSILON) return false;
  const aligned = value => value >= MIN_ALIGNMENT - EPSILON;
  return aligned(forward.x * normal.x + forward.z * normal.z)
    && aligned((dx * normal.x + dz * normal.z) / distance)
    && aligned((dx * forward.x + dz * forward.z) / distance);
}
