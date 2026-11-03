import { createRoom116Boundary, isRoom116PositionAllowed, resolveRoom116Movement } from '../src/room116-boundary.js';
import { room116ArrivalPosition } from '../src/room116-arrival.js';

// Flood a 10 cm grid from the actual D3 inward landing. Every graph edge must
// be traversable by the production sweep solver, including the furniture union.
export function room116NpcApproaches(zone, { approachClearance = 0 } = {}) {
  const boundary = createRoom116Boundary(zone);
  const world = (forward, left) => ({
    x: boundary.origin.x + boundary.forward.x * forward + boundary.left.x * left,
    z: boundary.origin.z + boundary.forward.z * forward + boundary.left.z * left,
  });
  const start = world(.6, 5);
  if (!isRoom116PositionAllowed(start, boundary)) throw new Error('Invalid doorway approach seed');
  const landing = room116ArrivalPosition({ x: boundary.portalPlaneX,
    z: (boundary.portalMinZ + boundary.portalMaxZ) / 2 }, zone);
  const joined = resolveRoom116Movement(landing, { x: start.x - landing.x, z: start.z - landing.z }, boundary);
  if (Math.hypot(joined.x - start.x, joined.z - start.z) > 1e-8) throw new Error('Grid seed is not reachable from D3 landing');
  const visited = new Set(['6,50']), queue = [{ f: 6, l: 50, point: start }];
  const approaches = new Map();
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const nearest = zone.npcs.map(npc => ({ npc, distance: Math.hypot(
      npc.position[0] - current.point.x, npc.position[2] - current.point.z
    ) })).sort((a, b) => a.distance - b.distance)[0];
    const clear = approachClearance === 0 || Array.from({ length: 16 }, (_, i) => i * Math.PI / 8)
      .every(angle => isRoom116PositionAllowed({
        x: current.point.x + Math.cos(angle) * approachClearance,
        z: current.point.z + Math.sin(angle) * approachClearance,
      }, boundary));
    if (clear && nearest.distance < (nearest.npc.radius ?? 2)
      && (!approaches.has(nearest.npc.id) || nearest.distance < approaches.get(nearest.npc.id).distance)) {
      approaches.set(nearest.npc.id, { point: current.point, distance: nearest.distance });
    }
    for (const [df, dl] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const f = current.f + df, l = current.l + dl, key = `${f},${l}`;
      if (f < 4 || f > 106 || l < 4 || l > 57 || visited.has(key)) continue;
      const point = world(f / 10, l / 10);
      if (!isRoom116PositionAllowed(point, boundary)) continue;
      const actual = resolveRoom116Movement(current.point,
        { x: point.x - current.point.x, z: point.z - current.point.z }, boundary);
      if (Math.hypot(actual.x - point.x, actual.z - point.z) > 1e-8) continue;
      visited.add(key); queue.push({ f, l, point });
    }
  }
  return approaches;
}
