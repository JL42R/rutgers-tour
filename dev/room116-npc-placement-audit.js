// One-time, read-only audit. Never imported by the tour or run on each frame.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRoom116Boundary, isRoom116PositionAllowed } from '../src/room116-boundary.js';
import { room116NpcApproaches } from '../test-support/room116-npc-approaches.js';

export function auditRoom116NpcPlacements(zone) {
  const boundary = createRoom116Boundary(zone);
  // Positive results prove a swept path from D3 and a nearest-NPC interaction
  // point. A finite grid cannot prove unreachability; negative results require
  // review instead of an arbitrary relocation away from the intended machine.
  const approaches = room116NpcApproaches(zone, { approachClearance: .02 });
  return zone.npcs.map(npc => {
    const inside = isRoom116PositionAllowed({ x: npc.position[0], z: npc.position[2] }, boundary);
    const approach = approaches.get(npc.id);
    return {
      npcId: npc.id,
      original: [...npc.position], corrected: [...npc.position], distanceMoved: 0,
      markerInsidePlayerArea: inside,
      accessible: Boolean(approach),
      manualReview: !approach,
      approach: approach?.point ?? null,
      interactionDistance: approach?.distance ?? null,
      reason: approach
        ? inside ? 'Keep: valid marker with a reachable interaction point.'
          : 'Keep: outside player area but interactable from the entrance component (requirement 6).'
        : 'Review: no reachable nearest-NPC interaction point found on the 10 cm grid. No safe minimal correction established; coordinates preserved.',
    };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(new URL('../public/zones.json', import.meta.url)));
  const zone = config.zones.find(candidate => candidate.id === 'project-studio');
  console.log(JSON.stringify({ zoneId: zone.id,
    method: '10 cm grid, production swept collision solver, 2 cm clearance probes, unchanged interaction radii',
    report: auditRoom116NpcPlacements(zone) }, null, 2));
}
