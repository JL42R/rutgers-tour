// Room 116's physical local rectangles. A player disk expands their union once.
// Sweeping each expanded member is equivalent to sweeping the expanded union;
// a valid start is outside every member, so hidden shared edges cannot be first hits.
const EPSILON = 1e-10; // numerical comparisons only, never an extra collision margin
const dot = (a, b) => a.forward * b.forward + a.left * b.left;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function compileRoom116Exclusions(config = [], width, depth) {
  if (!Array.isArray(config)) throw new Error('Room 116 exclusions must be an array.');
  const ids = new Set();
  return config.map(value => {
    if (typeof value.id !== 'string' || !value.id || ids.has(value.id)) {
      throw new Error('Room 116 exclusions require unique IDs.');
    }
    ids.add(value.id);
    for (const [axis, limit] of [['forward', depth], ['left', width]]) {
      const range = value[axis];
      if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite)
        || range[0] < 0 || range[0] >= range[1] || range[1] > limit) {
        throw new Error('Room 116 exclusions must be physical local rectangles inside the approved boundary.');
      }
    }
    return { id: value.id, minForward: value.forward[0], maxForward: value.forward[1],
      minLeft: value.left[0], maxLeft: value.left[1] };
  });
}

function separation(p, box) {
  const delta = {
    forward: p.forward - clamp(p.forward, box.minForward, box.maxForward),
    left: p.left - clamp(p.left, box.minLeft, box.maxLeft),
  };
  return { delta, distance: Math.hypot(delta.forward, delta.left) };
}

export function insideRoom116Exclusion(p, boxes, radius) {
  return boxes.some(box => separation(p, box).distance < radius - EPSILON);
}

export function room116ExclusionNormals(p, boxes, radius) {
  return boxes.flatMap(box => {
    const { delta, distance } = separation(p, box);
    return Math.abs(distance - radius) <= EPSILON * 8
      ? [{ forward: delta.forward / distance, left: delta.left / distance }] : [];
  });
}

// Exact disk-vs-rectangle sweep: four finite offset faces and four quarter circles.
export function firstRoom116ExclusionContact(p, step, boxes, radius) {
  let first = null;
  const accept = (time, normal, surface) => {
    if (time < -EPSILON || time > 1 || (first && time >= first.time)
      || dot(normal, step) >= -EPSILON) return;
    first = { time: Math.max(0, time), normal, surface };
  };
  const speedSquared = dot(step, step);
  if (speedSquared === 0) return null;
  for (const box of boxes) {
    for (const [axis, other, lo, hi, otherLo, otherHi] of [
      ['forward', 'left', box.minForward, box.maxForward, box.minLeft, box.maxLeft],
      ['left', 'forward', box.minLeft, box.maxLeft, box.minForward, box.maxForward],
    ]) {
      for (const [sign, edge] of [[-1, lo], [1, hi]]) {
        if (sign * step[axis] >= -EPSILON) continue;
        const surfaceAxis = edge + sign * radius;
        const time = (surfaceAxis - p[axis]) / step[axis];
        const tangent = p[other] + step[other] * time;
        if (tangent < otherLo - EPSILON || tangent > otherHi + EPSILON) continue;
        accept(time, { forward: 0, left: 0, [axis]: sign },
          { [axis]: surfaceAxis, [other]: tangent });
      }
    }
    for (const [forward, sf] of [[box.minForward, -1], [box.maxForward, 1]]) {
      for (const [left, sl] of [[box.minLeft, -1], [box.maxLeft, 1]]) {
        const q = { forward: p.forward - forward, left: p.left - left };
        const projection = dot(q, step), c = dot(q, q) - radius * radius;
        const discriminant = projection * projection - speedSquared * c;
        if (discriminant < 0) continue;
        // Stable near a surface: rationalize the entering root when outside.
        const root = Math.sqrt(discriminant);
        const time = c > 0 && projection < 0 ? c / (-projection + root)
          : (-projection - root) / speedSquared;
        if (time < -EPSILON || time > 1 || (first && time >= first.time)) continue;
        const hit = { forward: q.forward + step.forward * time, left: q.left + step.left * time };
        if (sf * hit.forward < -EPSILON || sl * hit.left < -EPSILON) continue;
        const length = Math.hypot(hit.forward, hit.left);
        if (length === 0) continue;
        const normal = { forward: hit.forward / length, left: hit.left / length };
        accept(time, normal, { forward: forward + radius * normal.forward, left: left + radius * normal.left });
      }
    }
  }
  return first;
}

// Closest permitted residual velocity at simultaneous contacts (2D convex cone).
// Re-evaluate contacts at each hit; do not retain normals after leaving an edge.
export function slideRoom116Contacts(step, normals) {
  const valid = v => normals.every(n => n.x * v.x + n.z * v.z >= -EPSILON);
  if (valid(step)) return step;
  let best = { x: 0, z: 0 }, error = step.x * step.x + step.z * step.z;
  for (const n of normals) {
    const speed = n.x * step.x + n.z * step.z;
    const candidate = { x: step.x - n.x * speed, z: step.z - n.z * speed };
    const difference = (candidate.x - step.x) ** 2 + (candidate.z - step.z) ** 2;
    if (valid(candidate) && difference < error) { best = candidate; error = difference; }
  }
  return best;
}
