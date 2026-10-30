import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApprovedKnowledgeView } from '../src/guide-knowledge-schema.js';
import {
  createLegacyGuideKnowledge,
  KnowledgeCompatibilityError
} from '../src/guide-knowledge-compat.js';
import { matchQuestion } from '../src/guide-qa.js';
import {
  createModelRequest, orchestrateGuideQuestion, validateModelResponse
} from '../src/guide-ai-orchestrator.js';
import { createConversationState, handleGuideQuestion } from '../src/guide-conversation.js';

const fixtureUrl = new URL('../knowledge/core-guide.fixture.v1.json', import.meta.url);
const fixtureText = readFileSync(fixtureUrl, 'utf8');

function rawFixture() {
  return JSON.parse(fixtureText);
}

function approvedFixture() {
  const result = createApprovedKnowledgeView(rawFixture());
  assert.equal(result.valid, true);
  return result.knowledge;
}

function frozenClone(value) {
  return Object.freeze(structuredClone(value));
}

test('converts only an approved view into the Stage 2–4 knowledge shape', () => {
  const legacy = createLegacyGuideKnowledge(approvedFixture());

  assert.equal(legacy.knowledgeVersion, 'fictional-2026-10-23.2');
  assert.deepEqual(legacy.topics.map((topic) => topic.id), [
    'folded-machines',
    'glass-gardens'
  ]);
  assert.equal(legacy.topics[0].status, 'verified');
  assert.equal(legacy.topics[0].facts[0].status, 'approved');
  assert.equal(legacy.topics[0].facts[0].text.includes('fictional fixture'), true);
  assert.deepEqual(legacy.specialists.map((record) => record.id), [
    'npc-folded-machines-guide',
    'npc-glass-gardens-guide'
  ]);
  assert.deepEqual(legacy.zones.map((record) => record.id), [
    'zone-imaginary-workshop',
    'zone-prism-conservatory'
  ]);
});

test('rejects the raw knowledge document instead of silently filtering it', () => {
  assert.throws(
    () => createLegacyGuideKnowledge(rawFixture()),
    KnowledgeCompatibilityError
  );
});

test('rejects a frozen document that still contains draft and retired records', () => {
  assert.throws(
    () => createLegacyGuideKnowledge(frozenClone(rawFixture())),
    /only approved source records/
  );
});

test('joins approved facts to their canonical topic without changing stable IDs', () => {
  const legacy = createLegacyGuideKnowledge(approvedFixture());
  const topic = legacy.topics[0];

  assert.equal(topic.id, 'folded-machines');
  assert.deepEqual(topic.facts, [{
    id: 'fact-folded-machines-motion',
    status: 'approved',
    text: 'In this fictional fixture, folded paper mechanisms demonstrate rotational motion.'
  }]);
});

test('uses approved zone directions for legacy specialist routing', () => {
  const legacy = createLegacyGuideKnowledge(approvedFixture());
  const topic = legacy.topics[0];
  const specialist = legacy.specialists[0];

  assert.equal(topic.type, 'route');
  assert.equal(topic.destinationNpcId, specialist.id);
  assert.equal(topic.destinationZoneId, specialist.zoneId);
  assert.equal(
    specialist.directions,
    'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.'
  );
});

test('existing Stage 2 matcher can use converted approved knowledge', () => {
  const legacy = createLegacyGuideKnowledge(approvedFixture());
  const result = matchQuestion('How do folded machines move?', legacy.topics);

  assert.equal(result.type, 'route');
  assert.equal(result.topicId, 'folded-machines');
  assert.equal(result.destinationNpcId, 'npc-folded-machines-guide');
  assert.equal(result.destinationZoneId, 'zone-imaginary-workshop');
});

test('existing Stage 4 request and response validators accept converted facts', () => {
  const legacy = createLegacyGuideKnowledge(approvedFixture());
  const topic = legacy.topics[0];
  const request = createModelRequest('Explain folded machines.', topic, {});
  const validation = validateModelResponse({
    answerText: request.facts[0].text,
    supported: true,
    topicId: topic.id,
    usedFactIds: [request.facts[0].id]
  }, topic.id, request.allowedFactIds);

  assert.deepEqual(request.allowedFactIds, ['fact-folded-machines-motion']);
  assert.equal(validation.valid, true);
});

test('draft and retired topics never enter converted knowledge', () => {
  const legacy = createLegacyGuideKnowledge(approvedFixture());
  const ids = legacy.topics.map((topic) => topic.id);

  assert.equal(ids.includes('cloud-kites'), false);
  assert.equal(ids.includes('glass-gardens'), true);
  assert.equal(ids.includes('clockwork-coral'), false);
});

test('the second approved topic keeps its own facts and canonical route', () => {
  const legacy = createLegacyGuideKnowledge(approvedFixture());
  const topic = legacy.topics.find((record) => record.id === 'glass-gardens');
  const specialist = legacy.specialists.find(
    (record) => record.id === 'npc-glass-gardens-guide'
  );

  assert.deepEqual(topic.facts.map((fact) => fact.id), [
    'fact-glass-gardens-light',
    'fact-glass-gardens-patterns'
  ]);
  assert.equal(topic.destinationNpcId, 'npc-glass-gardens-guide');
  assert.equal(topic.destinationZoneId, 'zone-prism-conservatory');
  assert.equal(
    specialist.directions,
    'From the fictional guide marker, follow the violet glass tiles to the prism conservatory.'
  );
});

test('rejects an orphan approved fact', () => {
  const approved = structuredClone(approvedFixture());
  approved.facts.push({
    ...structuredClone(approved.facts[0]),
    id: 'fact-folded-machines-orphan',
    content: 'A fictional approved fact that was not joined to its topic.'
  });

  assert.throws(
    () => createLegacyGuideKnowledge(Object.freeze(approved)),
    /must be joined to exactly one approved topic/
  );
});

test('rejects duplicate records and duplicate topic joins', () => {
  const duplicateRecord = structuredClone(approvedFixture());
  duplicateRecord.facts.push(structuredClone(duplicateRecord.facts[0]));
  assert.throws(
    () => createLegacyGuideKnowledge(Object.freeze(duplicateRecord)),
    /schema validation/
  );

  const duplicateJoin = structuredClone(approvedFixture());
  duplicateJoin.topics[0].factIds.push(duplicateJoin.topics[0].factIds[0]);
  assert.throws(
    () => createLegacyGuideKnowledge(Object.freeze(duplicateJoin)),
    /schema validation/
  );
});

test('rejects inconsistent specialist and destination relationships', () => {
  const approved = structuredClone(approvedFixture());
  approved.specialists[0].destinationZoneId = null;

  assert.throws(
    () => createLegacyGuideKnowledge(Object.freeze(approved)),
    /inconsistent specialist-zone relationship/
  );
});

test('does not mutate the approved view', () => {
  const approved = approvedFixture();
  const snapshot = JSON.stringify(approved);

  createLegacyGuideKnowledge(approved);

  assert.equal(JSON.stringify(approved), snapshot);
});

test('converted fictional routes stay rejected by the current runtime zone policy', async () => {
  const legacy = createLegacyGuideKnowledge(approvedFixture());
  let modelCalls = 0;
  const outcome = await orchestrateGuideQuestion('How do folded machines move?', legacy,
    createConversationState(), {
      resolveQuestion: handleGuideQuestion,
      resolverOptions: { matchQuestion },
      generateResponse: () => { modelCalls += 1; throw new Error('Must not generate.'); }
    });
  assert.equal(outcome.result.type, 'fallback');
  assert.deepEqual(outcome.state, createConversationState());
  assert.equal(modelCalls, 0);
});

test('converted scoped synthetic knowledge supports the merged guide pipeline and follow-ups', async () => {
  // Test-only remapping: this neither creates tour entities nor approves real CORE facts.
  const approved = structuredClone(approvedFixture());
  const ids = new Map([
    ['zone-imaginary-workshop', 'printing-room'], ['zone-prism-conservatory', 'hallway']
  ]);
  for (const zone of approved.zones) zone.id = ids.get(zone.id);
  for (const topic of approved.topics) {
    topic.destinationZoneIds = topic.destinationZoneIds.map((id) => ids.get(id));
  }
  for (const fact of approved.facts) {
    fact.relatedDestinationZoneIds = fact.relatedDestinationZoneIds.map((id) => ids.get(id));
  }
  for (const specialist of approved.specialists) {
    specialist.destinationZoneId = ids.get(specialist.destinationZoneId);
  }
  const validated = createApprovedKnowledgeView(approved);
  assert.equal(validated.valid, true);
  const snapshot = JSON.stringify(validated.knowledge);
  const legacy = createLegacyGuideKnowledge(validated.knowledge);
  let modelCalls = 0;
  const options = {
    resolveQuestion: handleGuideQuestion,
    resolverOptions: { matchQuestion },
    generateResponse: (request) => {
      modelCalls += 1;
      return {
        supported: true, topicId: request.topicId,
        answerText: request.facts[0].text, usedFactIds: [request.facts[0].id]
      };
    }
  };
  const outcome = await orchestrateGuideQuestion('How do folded machines move?', legacy,
    createConversationState(), options);
  assert.equal(outcome.result.type, 'route');
  assert.equal(outcome.result.destinationNpcId, 'npc-folded-machines-guide');
  assert.equal(outcome.result.destinationZoneId, 'printing-room');
  assert.equal(outcome.result.directions, legacy.specialists[0].directions);
  const directions = await orchestrateGuideQuestion('Where can I find them?', legacy, outcome.state, options);
  assert.equal(directions.result.response, legacy.specialists[0].directions);
  const expertise = await orchestrateGuideQuestion('What do they specialize in?', legacy, outcome.state, options);
  assert.equal(expertise.result.response, legacy.specialists[0].expertise);
  assert.equal(modelCalls, 1);
  assert.equal(JSON.stringify(validated.knowledge), snapshot);
});
