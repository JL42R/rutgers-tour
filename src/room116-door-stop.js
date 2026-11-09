import { allowsDoorTransition } from './door-transition-policy.js';
import { room116Coordinates, resolveRoom116Movement } from './room116-boundary.js';

// Extra room-side clearance beyond the existing, once-applied player radius.
export const ROOM116_EXIT_CLEARANCE = 0.05;

export function room116ExitStop({ zone, boundary, previous, current, movementEnabled, keys, yaw }) {
  if (zone?.id !== 'project-studio' || !boundary) return current;
  const transition = zone.transitions?.find(door => door.id === zone.walkingBoundary?.doorway?.transitionId
    && door.target === 'hallway' && door.axis === 'x' && door.direction === 'negative');
  if (!transition) return current;
  const before = room116Coordinates(previous, boundary).forward;
  const after = room116Coordinates(current, boundary).forward;
  const stop = boundary.minForward + ROOM116_EXIT_CLEARANCE;
  if (after >= before || after >= stop
    || Math.max(previous.z, current.z) < boundary.portalMinZ
    || Math.min(previous.z, current.z) > boundary.portalMaxZ
    || allowsDoorTransition({ transition, movementEnabled, keys, yaw, previous, current })) return current;

  // Remove only disallowed outward travel. Starts already in the corridor are
  // never snapped inward and can move sideways, inward, or turn and exit forward.
  const correction = Math.min(stop - after, before - after);
  const stopped = resolveRoom116Movement(previous, {
    x: current.x - previous.x + correction * boundary.forward.x,
    z: current.z - previous.z + correction * boundary.forward.z,
  }, boundary);
  // A jamb can clip tangential motion on world Z, reintroducing a tiny outward
  // component in the rotated basis. Do not let repeated attempts creep outward.
  return room116Coordinates(stopped, boundary).forward >= Math.min(before, stop) - 1e-10
    ? stopped : previous;
}
