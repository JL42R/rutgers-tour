// Draft data stays separate from zones.json. No measured equipment is bundled here.
export function parseEquipmentDrafts(text) {
  const boxes = JSON.parse(text);
  if (!Array.isArray(boxes) || boxes.length > 30) throw new Error('Use an array of at most 30 boxes.');
  const ids = new Set();
  return boxes.map((box) => {
    if (!box || typeof box !== 'object') throw new Error('Each draft must be a box object.');
    if (typeof box.id !== 'string' || !box.id.trim() || ids.has(box.id)) {
      throw new Error('Each box needs a unique, nonempty id.');
    }
    ids.add(box.id);
    for (const key of ['min', 'max']) {
      if (!Array.isArray(box[key]) || box[key].length !== 3 || !box[key].every(Number.isFinite)) {
        throw new Error(`${box.id}: ${key} must contain three finite numbers.`);
      }
    }
    if (box.min.some((value, axis) => value >= box.max[axis])) {
      throw new Error(`${box.id}: every min must be less than max.`);
    }
    return { id: box.id, min: [...box.min], max: [...box.max] };
  });
}

export function draftFromSamples(id, first, second, height) {
  // Samples are observation points; the editor must correct them to physical faces.
  return parseEquipmentDrafts(JSON.stringify([{
    id,
    min: [Math.min(first.x, second.x), 0, Math.min(first.z, second.z)],
    max: [Math.max(first.x, second.x), height, Math.max(first.z, second.z)],
  }]))[0];
}

export function assertDraftClearance(boxes, zone, player) {
  const overlaps = (box, x, z) => x > box.min[0] - 0.35 && x < box.max[0] + 0.35
    && z > box.min[2] - 0.35 && z < box.max[2] + 0.35;
  for (const box of boxes) {
    if (overlaps(box, zone.spawn[0], zone.spawn[2]) || overlaps(box, player.x, player.z)) {
      throw new Error(`${box.id}: expanded footprint overlaps the spawn or player.`);
    }
    // Keep the existing doorway and a 0.7 m approach on either side clear.
    for (const door of zone.transitions ?? []) {
      const axis = door.axis === 'x' ? 0 : 2;
      const across = axis === 0 ? 2 : 0;
      if (box.min[axis] < door.plane + 0.7 && box.max[axis] > door.plane - 0.7
        && box.min[across] < door.range[1] + 0.35 && box.max[across] > door.range[0] - 0.35) {
        throw new Error(`${box.id}: footprint intrudes on the doorway approach.`);
      }
    }
  }
  // Approximate 10 cm floor-plan check. This is a preview guard, not visual verification.
  const [width, length] = zone.placeholderSize;
  const [cx, , cz] = zone.placeholderCenter;
  const minX = cx - width / 2, minZ = cz - length / 2;
  const all = [...zone.collision, ...boxes];
  const cols = Math.ceil(width / 0.1), rows = Math.ceil(length / 0.1);
  const point = (index) => ({ x: minX + (index % cols + 0.5) * width / cols,
    z: minZ + (Math.floor(index / cols) + 0.5) * length / rows });
  const free = Array.from({ length: cols * rows }, (_, index) => {
    const p = point(index);
    return !all.some(box => overlaps(box, p.x, p.z));
  });
  const nearest = (x, z) => {
    let best = -1, distance = Infinity;
    free.forEach((open, index) => {
      const p = point(index), d = Math.hypot(p.x - x, p.z - z);
      if (open && d < distance) { best = index; distance = d; }
    });
    return best;
  };
  const start = nearest(zone.spawn[0], zone.spawn[2]);
  if (start < 0) throw new Error('No walkable floor remains.');
  const visited = new Set([start]), queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor], col = index % cols;
    const neighbors = [index - cols, index + cols];
    if (col > 0) neighbors.push(index - 1);
    if (col < cols - 1) neighbors.push(index + 1);
    for (const next of neighbors) {
      if (next >= 0 && next < free.length && free[next] && !visited.has(next)) {
        visited.add(next); queue.push(next);
      }
    }
  }
  if (!visited.has(nearest(player.x, player.z))) throw new Error('Drafts separate the player from the spawn.');
  for (const door of zone.transitions ?? []) {
    const mid = (door.range[0] + door.range[1]) / 2;
    const x = door.axis === 'x' ? door.plane : mid;
    const z = door.axis === 'x' ? mid : door.plane;
    if (!visited.has(nearest(x, z))) throw new Error('Drafts disconnect the doorway from the spawn.');
  }
  for (const npc of zone.npcs ?? []) {
    // E selects the nearest marker, so being inside a radius alone is insufficient.
    const reachable = queue.some((index) => {
      const p = point(index);
      const distance = n => Math.hypot(p.x - n.position[0], p.z - n.position[2]);
      const d = distance(npc);
      return d < (npc.radius ?? 2) && !zone.npcs.some(other => other !== npc && distance(other) < d);
    });
    if (!reachable) throw new Error(`Drafts remove a reachable interaction point for ${npc.id}.`);
  }
}
