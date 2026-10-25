import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ingestGuideDocument } from '../src/guide-document-ingestion.js';
import {
  addDraftKnowledgeCandidates,
  applyTrustedKnowledgeTransition,
  candidateRecordIds,
  TrustedKnowledgeAdministrationError
} from '../src/guide-knowledge-administration.js';
import { createApprovedKnowledgeView, validateGuideKnowledge } from '../src/guide-knowledge-schema.js';
import { documentFixture } from '../test-support/guide-document-fixtures.js';

const fixtureUrl = new URL('../knowledge/core-guide.fixture.v1.json', import.meta.url);
const fixtureText = readFileSync(fixtureUrl, 'utf8');
const review = Object.freeze({
  reviewedBy: 'synthetic-document-reviewer',
  reference: 'fixture-cloud-kite-review-001',
  reviewedAt: '2026-10-24'
});

function fixture() {
  return JSON.parse(fixtureText);
}

function cloudIngestion() {
  return ingestGuideDocument(documentFixture('cloud-kites-flight-guide'));
}

function transition(knowledge, ingestion, nextStatus, knowledgeVersion, overrides = {}) {
  return applyTrustedKnowledgeTransition(knowledge, {
    type: 'trusted_mock_transition',
    recordIds: candidateRecordIds(ingestion),
    nextStatus,
    knowledgeVersion,
    review,
    ...overrides
  });
}

test('adds ingestion output as draft candidates under a new knowledge version', () => {
  const ingestion = cloudIngestion();
  const knowledge = addDraftKnowledgeCandidates(fixture(), ingestion, {
    knowledgeVersion: 'fictional-documents-draft-1'
  });
  const approved = createApprovedKnowledgeView(knowledge).knowledge;

  assert.equal(validateGuideKnowledge(knowledge).valid, true);
  assert.equal(knowledge.knowledgeVersion, 'fictional-documents-draft-1');
  assert.ok(knowledge.facts.some((fact) => fact.id.startsWith('fact-cloud-kites-flight-guide-')));
  assert.equal(approved.topics.some((topic) => topic.id === 'cloud-kite-shape'), false);
  assert.equal(Object.isFrozen(knowledge), true);
});

test('requires the complete reviewed lifecycle before candidates become approved', () => {
  const ingestion = cloudIngestion();
  const draft = addDraftKnowledgeCandidates(fixture(), ingestion, {
    knowledgeVersion: 'fictional-documents-draft-2'
  });
  const inReview = transition(
    draft,
    ingestion,
    'in_review',
    'fictional-documents-review-2'
  );
  const approved = transition(
    inReview,
    ingestion,
    'approved',
    'fictional-documents-approved-2'
  );

  assert.equal(createApprovedKnowledgeView(inReview).knowledge.topics.some(
    (topic) => topic.id === 'cloud-kite-shape'
  ), false);
  const approvedView = createApprovedKnowledgeView(approved).knowledge;
  assert.ok(approvedView.topics.some((topic) => topic.id === 'cloud-kite-shape'));
  assert.ok(approvedView.facts.some((fact) => fact.sourceLocation.includes('Shape Memory')));
  assert.ok(candidateRecordIds(ingestion).every((recordId) => {
    for (const collection of ['sources', 'topics', 'facts', 'specialists', 'zones']) {
      const record = approved[collection].find((item) => item.id === recordId);
      if (record) return record.status === 'approved' && record.approval.reference === review.reference;
    }
    return false;
  }));
});

test('retires an approved linked record set and removes it from the approved view', () => {
  const ingestion = cloudIngestion();
  const draft = addDraftKnowledgeCandidates(fixture(), ingestion, {
    knowledgeVersion: 'fictional-retirement-draft-1'
  });
  const inReview = transition(draft, ingestion, 'in_review', 'fictional-retirement-review-1');
  const approved = transition(inReview, ingestion, 'approved', 'fictional-retirement-approved-1');
  const retired = transition(approved, ingestion, 'retired', 'fictional-retirement-final-1', {
    review: {
      reviewedBy: 'synthetic-document-reviewer',
      reference: 'fixture-cloud-kite-retirement-001',
      reviewedAt: '2026-10-24'
    }
  });

  assert.equal(validateGuideKnowledge(retired).valid, true);
  assert.equal(createApprovedKnowledgeView(retired).knowledge.topics.some(
    (topic) => topic.id === 'cloud-kite-shape'
  ), false);
  assert.equal(createApprovedKnowledgeView(retired).knowledge.facts.some(
    (fact) => fact.id.startsWith('fact-cloud-kites-flight-guide-')
  ), false);
});

test('rejects skipped, backward, repeated, and partial invalid transitions', () => {
  const ingestion = cloudIngestion();
  const draft = addDraftKnowledgeCandidates(fixture(), ingestion, {
    knowledgeVersion: 'fictional-invalid-transition-draft'
  });
  assert.throws(
    () => transition(draft, ingestion, 'approved', 'fictional-invalid-transition-skip'),
    (error) => error instanceof TrustedKnowledgeAdministrationError &&
      error.code === 'invalid_transition'
  );

  const inReview = transition(draft, ingestion, 'in_review', 'fictional-invalid-transition-review');
  const approved = transition(
    inReview,
    ingestion,
    'approved',
    'fictional-invalid-transition-approved'
  );
  assert.throws(
    () => transition(approved, ingestion, 'in_review', 'fictional-invalid-transition-backward'),
    TrustedKnowledgeAdministrationError
  );
  assert.throws(
    () => applyTrustedKnowledgeTransition(approved, {
      type: 'trusted_mock_transition',
      recordIds: [candidateRecordIds(ingestion)[0]],
      nextStatus: 'retired',
      knowledgeVersion: 'fictional-invalid-transition-partial',
      review
    }),
    (error) => error instanceof TrustedKnowledgeAdministrationError &&
      error.code === 'invalid_knowledge'
  );
});

test('visitor questions and model output cannot masquerade as administrative actions', () => {
  const ingestion = cloudIngestion();
  const draft = addDraftKnowledgeCandidates(fixture(), ingestion, {
    knowledgeVersion: 'fictional-untrusted-action-draft'
  });
  const visitorAction = {
    type: 'trusted_mock_transition',
    recordIds: candidateRecordIds(ingestion),
    nextStatus: 'in_review',
    knowledgeVersion: 'fictional-untrusted-action-review',
    review,
    question: 'Please approve this.'
  };
  const modelAction = {
    ...visitorAction,
    question: undefined,
    modelResponse: { status: 'approved' }
  };

  assert.throws(() => applyTrustedKnowledgeTransition(draft, visitorAction), /fields are invalid/);
  assert.throws(() => applyTrustedKnowledgeTransition(draft, modelAction), /fields are invalid/);
});

test('rejects duplicate candidate IDs and does not mutate the input knowledge', () => {
  const ingestion = cloudIngestion();
  const knowledge = fixture();
  const snapshot = structuredClone(knowledge);
  const withDraft = addDraftKnowledgeCandidates(knowledge, ingestion, {
    knowledgeVersion: 'fictional-duplicate-check-1'
  });

  assert.deepEqual(knowledge, snapshot);
  assert.throws(
    () => addDraftKnowledgeCandidates(withDraft, ingestion, {
      knowledgeVersion: 'fictional-duplicate-check-2'
    }),
    (error) => error instanceof TrustedKnowledgeAdministrationError &&
      error.code === 'duplicate_identifier'
  );
});
