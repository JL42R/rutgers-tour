// Room 116 only: the approved outer rectangle/doorway plus optional physical local exclusions.
// The player is a point after each solid wall is inset once by the shared player radius.
import { PLAYER_RADIUS } from './collision.js';
import {
  compileRoom116Exclusions, insideRoom116Exclusion, firstRoom116ExclusionContact,
  room116ExclusionNormals, slideRoom116Contacts,
} from './room116-exclusions.js';

const EPSILON = 1e-10; // floating-point comparisons only; this is not a physical inset
const GEOMETRY_TOLERANCE = 1e-8;
const MAX_CONTACTS = 8; // six boundary planes, with room for simultaneous corner contacts
const dot = (a, b) => a.x * b.x + a.z * b.z;
const subtract = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });

function point(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
    throw new Error('Room 116 boundary points must contain finite world X/Z coordinates.');
  }
  return { x: value[0], z: value[1] };
}

export function room116Coordinates(position, boundary) {
  const delta = subtract(position, boundary.origin);
  return { forward: dot(delta, boundary.forward), left: dot(delta, boundary.left) };
}

// Compile only the explicitly configured Project Studio. Other zones never use this solver.
export function createRoom116Boundary(zone) {
  if (zone?.id !== 'project-studio' || !zone.walkingBoundary) {
    throw new Error('Oriented walking boundaries are configured only for project-studio.');
  }
  const config = zone.walkingBoundary;
  const origin = point(config.entranceRight);
  const forwardVector = subtract(point(config.farRight), origin);
  const leftVector = subtract(point(config.entranceLeft), origin);
  const forwardLength = Math.hypot(forwardVector.x, forwardVector.z);
  const leftLength = Math.hypot(leftVector.x, leftVector.z);
  if (!Number.isFinite(config.width) || !Number.isFinite(config.depth)
    || config.width <= 2 * PLAYER_RADIUS || config.depth <= 2 * PLAYER_RADIUS
    || Math.abs(config.width - leftLength) > GEOMETRY_TOLERANCE
    || Math.abs(config.depth - forwardLength) > GEOMETRY_TOLERANCE) {
    throw new Error('Room 116 boundary dimensions must match its corners.');
  }
  const forward = { x: forwardVector.x / forwardLength, z: forwardVector.z / forwardLength };
  const left = { x: leftVector.x / leftLength, z: leftVector.z / leftLength };
  const farLeft = point(config.farLeft);
  if (Math.abs(dot(forward, left)) > GEOMETRY_TOLERANCE
    || Math.hypot(farLeft.x - origin.x - forwardVector.x - leftVector.x,
      farLeft.z - origin.z - forwardVector.z - leftVector.z) > GEOMETRY_TOLERANCE) {
    throw new Error('Room 116 walking corners must form an orthogonal rectangle.');
  }
  const transition = zone.transitions?.find(t => t.id === config.doorway?.transitionId);
  const opening = config.doorway?.openingZ;
  if (transition?.axis !== 'x' || transition.direction !== 'negative' || transition.target !== 'hallway'
    || !Number.isFinite(transition.plane) || !Array.isArray(transition.range)
    || transition.range.length !== 2 || !transition.range.every(Number.isFinite)
    || !Array.isArray(opening) || opening.length !== 2 || !opening.every(Number.isFinite)
    || Math.abs(transition.range[0] - opening[0] - PLAYER_RADIUS) > GEOMETRY_TOLERANCE
    || Math.abs(opening[1] - transition.range[1] - PLAYER_RADIUS) > GEOMETRY_TOLERANCE
    || transition.range[0] >= transition.range[1]) {
    throw new Error('Room 116 doorway must reference its existing radius-safe hallway transition.');
  }
  const boundary = {
    origin, forward, left, width: config.width, depth: config.depth,
    radius: PLAYER_RADIUS, minForward: PLAYER_RADIUS, maxForward: config.depth - PLAYER_RADIUS,
    minLeft: PLAYER_RADIUS, maxLeft: config.width - PLAYER_RADIUS,
    portalMinZ: transition.range[0], portalMaxZ: transition.range[1], portalPlaneX: transition.plane,
    exclusions: compileRoom116Exclusions(config.exclusions, config.width, config.depth),
  };
  // Both existing D3 crossing limits must lie in the corridor, behind the solid front-wall inset.
  for (const z of transition.range) {
    const local = room116Coordinates({ x: transition.plane, z }, boundary);
    if (local.left < boundary.minLeft - EPSILON || local.left > boundary.maxLeft + EPSILON
      || local.forward > boundary.minForward + EPSILON) {
      throw new Error('Room 116 boundary would obstruct the existing D3 crossing range.');
    }
  }
  const plane = (normal, offset, active = () => true, portalZ = null) => ({ normal, offset, active, portalZ });
  boundary.planes = [
    plane(left, dot(left, origin) + boundary.minLeft),
    plane({ x: -left.x, z: -left.z }, -dot(left, origin) - boundary.maxLeft),
    plane({ x: -forward.x, z: -forward.z }, -dot(forward, origin) - boundary.maxForward),
    // The entrance wall exists everywhere except the measured, already radius-safe aperture.
    plane(forward, dot(forward, origin) + boundary.minForward,
      p => p.z < boundary.portalMinZ - EPSILON || p.z > boundary.portalMaxZ + EPSILON),
    // Corridor jambs end at the front inset; sideways motion inside the room remains unrestricted.
    ...[[1, boundary.portalMinZ], [-1, boundary.portalMaxZ]].map(([sign, z]) =>
      plane({ x: 0, z: sign }, sign * z, (p, step) => {
        const d = room116Coordinates(p, boundary).forward;
        return d < boundary.minForward - EPSILON
          || (d <= boundary.minForward + EPSILON && dot(forward, step) < -EPSILON);
      }, z)),
  ];
  return boundary;
}

export function isRoom116PositionAllowed(position, boundary) {
  const local = room116Coordinates(position, boundary);
  return local.left >= boundary.minLeft - EPSILON && local.left <= boundary.maxLeft + EPSILON
    && local.forward <= boundary.maxForward + EPSILON
    && (local.forward >= boundary.minForward - EPSILON
      || (position.z >= boundary.portalMinZ - EPSILON && position.z <= boundary.portalMaxZ + EPSILON))
    && !insideRoom116Exclusion(local, boundary.exclusions, boundary.radius);
}

// Sweep the whole frame step to the first wall, then slide the remainder along that wall.
// This clips velocity, not the camera position, so switching zones never snaps an entry inward.
export function resolveRoom116Movement(position, step, boundary) {
  const current = { x: position.x, z: position.z };
  if (!isRoom116PositionAllowed(current, boundary)) return current; // never teleport an invalid spawn
  let remaining = { x: step.x, z: step.z };
  for (let contact = 0; contact < MAX_CONTACTS; contact++) {
    if (Math.hypot(remaining.x, remaining.z) <= EPSILON) break;
    let first = null;
    for (const plane of boundary.planes) {
      const speed = dot(plane.normal, remaining);
      if (speed >= -EPSILON) continue;
      const distance = dot(plane.normal, current) - plane.offset;
      if (distance < -EPSILON) continue; // an inactive half-plane, e.g. a jamb beside the room interior
      const time = Math.max(0, distance) / -speed;
      if (time > 1 || (first && time >= first.time)) continue;
      const hit = { x: current.x + remaining.x * time, z: current.z + remaining.z * time };
      if (plane.active(hit, remaining)) first = { plane, time };
    }
    const worldNormal = n => ({
      x: n.forward * boundary.forward.x + n.left * boundary.left.x,
      z: n.forward * boundary.forward.z + n.left * boundary.left.z,
    });
    const contact = firstRoom116ExclusionContact(room116Coordinates(current, boundary), {
      forward: dot(remaining, boundary.forward), left: dot(remaining, boundary.left),
    }, boundary.exclusions, boundary.radius);
    if (contact && (!first || contact.time < first.time)) {
      const normal = worldNormal(contact.normal);
      const surface = {
        x: boundary.origin.x + contact.surface.forward * boundary.forward.x + contact.surface.left * boundary.left.x,
        z: boundary.origin.z + contact.surface.forward * boundary.forward.z + contact.surface.left * boundary.left.z,
      };
      first = { time: contact.time, plane: { normal, offset: dot(normal, surface), portalZ: null } };
    }
    if (!first) {
      current.x += remaining.x; current.z += remaining.z;
      break;
    }
    current.x += remaining.x * first.time;
    current.z += remaining.z * first.time;
    // Remove only numerical roundoff at contact. Exact portal Z also preserves inclusive D3 limits.
    const correction = first.plane.offset - dot(first.plane.normal, current);
    current.x += first.plane.normal.x * correction;
    current.z += first.plane.normal.z * correction;
    if (first.plane.portalZ !== null) current.z = first.plane.portalZ;
    remaining.x *= 1 - first.time; remaining.z *= 1 - first.time;
    if (boundary.exclusions.length) {
      const normals = [first.plane.normal];
      for (const plane of boundary.planes) {
        if (Math.abs(dot(plane.normal, current) - plane.offset) <= EPSILON * 8 && plane.active(current, remaining)) {
          normals.push(plane.normal);
        }
      }
      normals.push(...room116ExclusionNormals(room116Coordinates(current, boundary), boundary.exclusions, boundary.radius).map(worldNormal));
      remaining = slideRoom116Contacts(remaining, normals);
    } else {
      const outward = dot(first.plane.normal, remaining);
      remaining.x -= first.plane.normal.x * outward;
      remaining.z -= first.plane.normal.z * outward;
    }
  }
  return current;
}
