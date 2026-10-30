import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ingestGuideDocument } from '../src/guide-document-ingestion.js';
import {
  addDraftKnowledgeCandidates,
  applyTrustedKnowledgeTransition,
  candidateRecordIds
} from '../src/guide-knowledge-administration.js';
import { createApprovedKnowledgeRetriever } from '../src/guide-knowledge-retrieval.js';
import { createApprovedKnowledgeView } from '../src/guide-knowledge-schema.js';
import { documentFixture } from '../test-support/guide-document-fixtures.js';

const fixtureUrl = new URL('../knowledge/core-guide.fixture.v1.json', import.meta.url);
const fixtureText = readFileSync(fixtureUrl, 'utf8');
const review = {
  reviewedBy: 'synthetic-document-reviewer',
  reference: 'fixture-cloud-kite-retrieval-review-001',
  reviewedAt: '2026-10-24'
};

function fixture() {
  return JSON.parse(fixtureText);
}

function approvedFixture() {
  return createApprovedKnowledgeView(fixture()).knowledge;
}

function approvedCloudKnowledge() {
  const ingestion = ingestGuideDocument(documentFixture('cloud-kites-flight-guide'));
  let knowledge = addDraftKnowledgeCandidates(fixture(), ingestion, {
    knowledgeVersion: 'fictional-retrieval-draft-1'
  });
  for (const [nextStatus, knowledgeVersion] of [
    ['in_review', 'fictional-retrieval-review-1'],
    ['approved', 'fictional-retrieval-approved-1']
  ]) {
    knowledge = applyTrustedKnowledgeTransition(knowledge, {
      type: 'trusted_mock_transition',
      recordIds: candidateRecordIds(ingestion),
      nextStatus,
      knowledgeVersion,
      review
    });
  }
  return { knowledge, ingestion };
}

test('retrieves and ranks approved facts with stable source locations', () => {
  const retriever = createApprovedKnowledgeRetriever(approvedFixture());
  const result = retriever.search('How do glass gardens create changing light patterns?');

  assert.equal(result.outcome, 'matched');
  assert.equal(result.topicId, 'glass-gardens');
  assert.equal(result.knowledgeVersion, 'fictional-2026-10-23.2');
  assert.equal(result.results[0].factId, 'fact-glass-gardens-patterns');
  assert.equal(result.results[0].sourceId, 'source-glass-garden-notes');
  assert.equal(result.results[0].sourceLocation, 'Section A, paragraph 2');
  assert.ok(result.results[0].score >= result.results.at(-1).score);
});

test('limits results deterministically while preserving fact and source IDs', () => {
  const retriever = createApprovedKnowledgeRetriever(approvedFixture());
  const first = retriever.search('Tell me about glass gardens.', { limit: 1 });
  const second = retriever.search('Tell me about glass gardens.', { limit: 1 });

  assert.deepEqual(first, second);
  assert.equal(first.results.length, 1);
  assert.match(first.results[0].factId, /^fact-/);
  assert.match(first.results[0].sourceId, /^source-/);
});

test('draft and retired records are absent from approved retrieval', () => {
  const retriever = createApprovedKnowledgeRetriever(approvedFixture());

  assert.equal(retriever.search('How do cloud kites change color?').outcome, 'unsupported');
  assert.equal(retriever.search('How does clockwork coral move?').outcome, 'unsupported');
});

test('newly approved document passages become retrievable without changing the retriever', () => {
  const { knowledge } = approvedCloudKnowledge();
  const result = createApprovedKnowledgeRetriever(
    createApprovedKnowledgeView(knowledge).knowledge
  ).search('How do cloud kites maintain their shape?');

  assert.equal(result.outcome, 'matched');
  assert.equal(result.topicId, 'cloud-kite-shape');
  assert.equal(result.knowledgeVersion, 'fictional-retrieval-approved-1');
  assert.equal(result.results[0].factId, 'fact-cloud-kites-flight-guide-v1-001');
  assert.equal(result.results[0].sourceId, 'source-cloud-kites-flight-guide-v1');
  assert.match(result.results[0].sourceLocation, /Shape Memory/);
  assert.match(result.results[0].content, /flexible silver ribs/);
});

test('reports equal approved topic evidence as ambiguous', () => {
  const retriever = createApprovedKnowledgeRetriever(approvedFixture());
  const result = retriever.search('Tell me about folded glass.');

  assert.equal(result.outcome, 'ambiguous');
  assert.equal(result.topicId, null);
  assert.deepEqual(result.results, []);
});

test('rejects malformed questions and handles unsupported information safely', () => {
  const retriever = createApprovedKnowledgeRetriever(approvedFixture());

  assert.equal(retriever.search('').outcome, 'invalid');
  assert.equal(retriever.search(null).outcome, 'invalid');
  assert.equal(retriever.search('q'.repeat(301)).outcome, 'invalid');
  assert.equal(retriever.search('Will it rain tomorrow?').outcome, 'unsupported');
});

test('validates approved references before building the index', () => {
  const malformed = structuredClone(approvedFixture());
  malformed.facts[0].sourceId = 'source-invented';

  assert.throws(() => createApprovedKnowledgeRetriever(malformed), /invalid/);
});

test('retrieval does not mutate approved knowledge or questions', () => {
  const knowledge = approvedFixture();
  const snapshot = JSON.stringify(knowledge);
  const question = 'How do folded machines move?';
  const retriever = createApprovedKnowledgeRetriever(knowledge);

  retriever.search(question);
  assert.equal(JSON.stringify(knowledge), snapshot);
  assert.equal(question, 'How do folded machines move?');
});
