import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditRoom116NpcPlacements } from '../dev/room116-npc-placement-audit.js';
import { createRoom116Boundary, isRoom116PositionAllowed } from '../src/room116-boundary.js';

const studio = JSON.parse(readFileSync(new URL('../public/zones.json', import.meta.url)))
  .zones.find(zone => zone.id === 'project-studio');

function fixture(forward, left) {
  const zone = structuredClone(studio), boundary = createRoom116Boundary(zone);
  zone.npcs = [{ ...zone.npcs[0], position: [
    boundary.origin.x + boundary.forward.x * forward + boundary.left.x * left,
    1.75,
    boundary.origin.z + boundary.forward.z * forward + boundary.left.z * left,
  ] }];
  return zone;
}

for (const [name, forward, left, valid] of [
  ['already inside valid area', 5, 3, true],
  ['just outside a physical wall', 5, studio.walkingBoundary.width + .05, false],
  ['inside entrance-right exclusion', 1.5, 3, false],
  ['near far-left corner', studio.walkingBoundary.depth + .05, studio.walkingBoundary.width + .05, false],
  ['outside but close enough to interact', 9, studio.walkingBoundary.width + 1.4, false],
]) test(`placement audit preserves ${name} when accessible`, () => {
  const zone = fixture(forward, left), before = structuredClone(zone);
  const [report] = auditRoom116NpcPlacements(zone);
  assert.equal(report.markerInsidePlayerArea, valid);
  assert.equal(report.accessible, true);
  assert.equal(report.manualReview, false);
  assert.equal(report.distanceMoved, 0);
  assert.deepEqual(report.original, report.corrected);
  assert.deepEqual(zone, before);
  assert(isRoom116PositionAllowed(report.approach, createRoom116Boundary(zone)));
  assert(report.interactionDistance < zone.npcs[0].radius);
});

test('placement audit flags a disconnected valid area instead of relocating to unrelated equipment', () => {
  const zone = fixture(8, 3);
  zone.walkingBoundary.exclusions.push({ id: 'test-only-full-width-divider',
    forward: [4, 4.2], left: [0, zone.walkingBoundary.width] });
  const before = structuredClone(zone), [report] = auditRoom116NpcPlacements(zone);
  assert.equal(report.markerInsidePlayerArea, true);
  assert.equal(report.accessible, false);
  assert.equal(report.manualReview, true);
  assert.deepEqual(report.original, report.corrected);
  assert.deepEqual(zone, before);
});

test('placement audit flags a distant inaccessible marker without silently changing coordinates', () => {
  const zone = fixture(30, 3), [report] = auditRoom116NpcPlacements(zone);
  assert.equal(report.accessible, false);
  assert.equal(report.manualReview, true);
  assert.equal(report.distanceMoved, 0);
  assert.deepEqual(report.corrected, zone.npcs[0].position);
});

test('all six actual placements meet the keep-if-interactable rule with their Y values unchanged', () => {
  const before = structuredClone(studio), report = auditRoom116NpcPlacements(studio);
  assert.equal(report.length, 6);
  for (const row of report) {
    assert.equal(row.accessible, true, row.npcId);
    assert.equal(row.distanceMoved, 0);
    assert.deepEqual(row.corrected, row.original);
  }
  assert.deepEqual(studio, before);
});
