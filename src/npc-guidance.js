// NPC recommendations stay inside the current room. Room navigation is separate.
import { isComingSoon } from './npc-availability.js';

export function npcGuidance(target, currentZone) {
  if (!target || !currentZone || currentZone.id === 'hallway' || target.zoneId !== currentZone.id) return null;
  const npc = currentZone.npcs?.find(candidate => candidate.id === target.npcId);
  if (isComingSoon(npc) || !npc?.position || ![npc.position[0], npc.position[2]].every(Number.isFinite)) return null;
  return {
    id: npc.id, label: target.label,
    position: { x: npc.position[0], z: npc.position[2] }, radius: npc.radius ?? 2,
  };
}
