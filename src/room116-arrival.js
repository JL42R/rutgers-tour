// A D3 arrival target, expressed in the verified room basis rather than world +X.
import {
  createRoom116Boundary, room116Coordinates, isRoom116PositionAllowed, resolveRoom116Movement,
} from './room116-boundary.js';

const ARRIVAL_FORWARD = 0.60;

export function room116ArrivalPosition(position, zone) {
  if (zone?.id !== 'project-studio') return null;
  const boundary = createRoom116Boundary(zone);
  if (!isRoom116PositionAllowed(position, boundary)) return null;
  const local = room116Coordinates(position, boundary);
  const advance = Math.max(0, ARRIVAL_FORWARD - local.forward);
  const next = {
    x: position.x + advance * boundary.forward.x,
    z: position.z + advance * boundary.forward.z,
  };
  // Keep a straight backward route through the original world-Z aperture.
  // Preserve local lateral position except for the smallest necessary shift at an edge.
  const returnZ = Math.max(boundary.portalMinZ, Math.min(boundary.portalMaxZ, next.z));
  const lateralShift = (returnZ - next.z) / boundary.left.z;
  next.x += lateralShift * boundary.left.x;
  next.z = returnZ;

  // Validate both destination and swept route with the actual approved collision solver.
  if (!isRoom116PositionAllowed(next, boundary)) return null;
  const reached = resolveRoom116Movement(position, {
    x: next.x - position.x, z: next.z - position.z,
  }, boundary);
  if (Math.hypot(reached.x - next.x, reached.z - next.z) > 1e-8) return null;
  return next;
}
