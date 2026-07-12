// collision.js — keeps the player out of walls.
// Walls and furniture are described as invisible boxes in zones.json
// (an "AABB" = axis-aligned bounding box: just a min corner and max corner).
// We never collide with the splat itself — splats have no real geometry.

const PLAYER_RADIUS = 0.35; // meters — how close you can get to a wall

// Would a player standing at (x, z) overlap this box (expanded by the player radius)?
function hits(x, z, box) {
  return (
    x > box.min[0] - PLAYER_RADIUS && x < box.max[0] + PLAYER_RADIUS &&
    z > box.min[2] - PLAYER_RADIUS && z < box.max[2] + PLAYER_RADIUS
  );
}

// Move by `step`, but test the X and Z axes separately.
// If moving along one axis would put us inside a wall, cancel just that axis —
// this makes the player slide smoothly along walls instead of sticking to them.
export function resolveMovement(position, step, boxes = []) {
  let x = position.x + step.x;
  let z = position.z;

  for (const box of boxes) {
    if (hits(x, z, box)) { x = position.x; break; }
  }

  z = position.z + step.z;
  for (const box of boxes) {
    if (hits(x, z, box)) { z = position.z; break; }
  }

  return { x, z };
}
