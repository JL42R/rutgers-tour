// Missing availability means an existing, required tour conversation.
export function isComingSoon(npc) {
  return npc?.availability === 'coming-soon';
}
