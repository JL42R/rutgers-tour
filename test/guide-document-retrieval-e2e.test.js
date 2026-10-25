import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ingestGuideDocument } from '../src/guide-document-ingestion.js';
import {
  addDraftKnowledgeCandidates,
  applyTrustedKnowledgeTransition,
  candidateRecordIds
} from '../src/guide-knowledge-administration.js';
import { createStaticApprovedKnowledgeLoader } from '../worker/src/approved-knowledge.js';
import { createGuideHandler } from '../worker/src/guide-handler.js';
import { createMockGuideModel } from '../worker/src/mock-guide-model.js';
import { documentFixture } from '../test-support/guide-document-fixtures.js';

const knowledgeUrl = new URL('../knowledge/core-guide.fixture.v1.json', import.meta.url);
const evaluationUrl = new URL('../knowledge/guide-evaluation.fixture.v1.json', import.meta.url);
const knowledgeText = readFileSync(knowledgeUrl, 'utf8');
const evaluationFixture = JSON.parse(readFileSync(evaluationUrl, 'utf8'));
const allowedOrigin = 'https://evaluation.example.test';
const review = Object.freeze({
  reviewedBy: 'synthetic-document-reviewer',
  reference: 'fixture-worker-cloud-review-001',
  reviewedAt: '2026-10-24'
});

function fixture() {
  return JSON.parse(knowledgeText);
}

function transition(knowledge, ingestion, nextStatus, knowledgeVersion, reviewMetadata = review) {
  return applyTrustedKnowledgeTransition(knowledge, {
    type: 'trusted_mock_transition',
    recordIds: candidateRecordIds(ingestion),
    nextStatus,
    knowledgeVersion,
    review: reviewMetadata
  });
}

function lifecycleSnapshots() {
  const cloud = ingestGuideDocument(documentFixture('cloud-kites-flight-guide'));
  const adversarial = ingestGuideDocument(documentFixture('malicious-override-note'));
  const initial = fixture();
  const cloudDraft = addDraftKnowledgeCandidates(initial, cloud, {
    knowledgeVersion: 'fictional-worker-cloud-draft-1'
  });
  const draft = addDraftKnowledgeCandidates(cloudDraft, adversarial, {
    knowledgeVersion: 'fictional-worker-documents-draft-2'
  });
  const inReview = transition(
    draft,
    cloud,
    'in_review',
    'fictional-worker-cloud-review-1'
  );
  const approved = transition(
    inReview,
    cloud,
    'approved',
    'fictional-worker-cloud-approved-1'
  );
  const retired = transition(
    approved,
    cloud,
    'retired',
    'fictional-worker-cloud-retired-1',
    {
      reviewedBy: 'synthetic-document-reviewer',
      reference: 'fixture-worker-cloud-retirement-001',
      reviewedAt: '2026-10-24'
    }
  );
  return { initial, draft, in_review: inReview, approved, retired, cloud };
}

let requestSequence = 0;
function requestFor(question, temporaryContext = {
  topicIds: [],
  specialistNpcIds: [],
  destinationZoneIds: []
}) {
  requestSequence += 1;
  return new Request('https://worker.example.test/guide', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': allowedOrigin
    },
    body: JSON.stringify({
      schemaVersion: '1.1',
      requestId: `evaluation-${requestSequence}`,
      question,
      temporaryContext
    })
  });
}

function contextFrom(response) {
  return {
    topicIds: response.topicId ? [response.topicId] : [],
    specialistNpcIds: response.specialistNpcId ? [response.specialistNpcId] : [],
    destinationZoneIds: response.destinationZoneId ? [response.destinationZoneId] : []
  };
}

async function responseBody(handler, question, context) {
  const response = await handler(requestFor(question, context));
  assert.ok([200, 503].includes(response.status));
  return response.json();
}

test('actual Worker path gates cloud-kite retrieval through trusted approval and retirement', async () => {
  const snapshots = lifecycleSnapshots();
  const baseModel = createMockGuideModel();
  let generateCalls = 0;
  let trainingCalls = 0;
  const unchangedModel = Object.freeze({
    generateResponse(request, invocation) {
      generateCalls += 1;
      return baseModel.generateResponse(request, invocation);
    },
    train() {
      trainingCalls += 1;
      throw new Error('Model training must never occur in document publication.');
    }
  });
  const handlerFor = (knowledge) => createGuideHandler({
    loadKnowledge: createStaticApprovedKnowledgeLoader(knowledge),
    model: unchangedModel,
    allowedOrigins: [allowedOrigin]
  });
  const question = 'How do cloud kites maintain their shape?';

  const initial = await responseBody(handlerFor(snapshots.initial), question);
  const draft = await responseBody(handlerFor(snapshots.draft), question);
  const inReview = await responseBody(handlerFor(snapshots.in_review), question);
  const approved = await responseBody(handlerFor(snapshots.approved), question);
  const retired = await responseBody(handlerFor(snapshots.retired), question);

  assert.deepEqual(
    [initial.outcome, draft.outcome, inReview.outcome, approved.outcome, retired.outcome],
    ['unsupported', 'unsupported', 'unsupported', 'answered', 'unsupported']
  );
  assert.deepEqual(approved.factReferences, [{
    factId: 'fact-cloud-kites-flight-guide-v1-001',
    sourceId: 'source-cloud-kites-flight-guide-v1'
  }]);
  assert.equal(approved.topicId, 'cloud-kite-shape');
  assert.equal(approved.specialistNpcId, 'npc-cloud-kite-guide');
  assert.equal(approved.specialistName, 'Fictional Cloud Kite Guide');
  assert.equal(approved.destinationZoneId, 'zone-cloud-kite-loft');
  assert.equal(approved.destinationZoneName, 'Fictional Cloud Kite Loft');
  assert.equal(
    approved.canonicalDirections,
    'From the fictional guide marker, follow the painted cloud spirals to the kite loft.'
  );
  assert.equal(approved.knowledgeVersion, 'fictional-worker-cloud-approved-1');
  assert.equal(generateCalls, 1);
  assert.equal(trainingCalls, 0);
});

test('retirement and a new knowledge version reject stale approved conversation context', async () => {
  const snapshots = lifecycleSnapshots();
  const handlerFor = (knowledge) => createGuideHandler({
    loadKnowledge: createStaticApprovedKnowledgeLoader(knowledge),
    model: createMockGuideModel(),
    allowedOrigins: [allowedOrigin]
  });

  const approved = await responseBody(
    handlerFor(snapshots.approved),
    'How do cloud kites maintain their shape?'
  );
  assert.equal(approved.outcome, 'answered');

  const staleResponse = await handlerFor(snapshots.retired)(requestFor(
    'Where is that guide?',
    contextFrom(approved)
  ));
  const staleBody = await staleResponse.json();

  assert.equal(staleResponse.status, 400);
  assert.deepEqual(staleBody, {
    schemaVersion: '1.1',
    error: {
      code: 'invalid_request',
      message: 'Request schema is invalid.'
    }
  });
  assert.equal(snapshots.retired.knowledgeVersion, 'fictional-worker-cloud-retired-1');
});

test('fixed synthetic knowledge evaluation passes through the actual Worker retrieval path', async (t) => {
  const snapshots = lifecycleSnapshots();
  const baseModel = createMockGuideModel();
  const model = Object.freeze({
    generateResponse: (request, invocation) => baseModel.generateResponse(request, invocation)
  });
  const handlers = Object.fromEntries(Object.entries(snapshots)
    .filter(([stage]) => ['initial', 'draft', 'in_review', 'approved', 'retired'].includes(stage))
    .map(([stage, knowledge]) => [stage, createGuideHandler({
      loadKnowledge: createStaticApprovedKnowledgeLoader(knowledge),
      model,
      allowedOrigins: [allowedOrigin]
    })]));

  assert.equal(evaluationFixture.schemaVersion, '1.0');
  assert.equal(evaluationFixture.evaluations.length, 15);
  for (const evaluation of evaluationFixture.evaluations) {
    await t.test(evaluation.id, async () => {
      const handler = handlers[evaluation.stage];
      assert.ok(handler, `Unknown evaluation stage: ${evaluation.stage}`);
      let context;
      if (evaluation.contextQuestion) {
        const contextResponse = await responseBody(handler, evaluation.contextQuestion);
        assert.equal(contextResponse.outcome, 'answered');
        context = contextFrom(contextResponse);
      }
      const response = await responseBody(handler, evaluation.question, context);
      const expected = evaluation.expected;

      assert.equal(response.outcome, expected.outcome);
      assert.equal(response.topicId, expected.topicId);
      assert.deepEqual(
        response.factReferences.map((reference) => reference.factId),
        expected.factIds
      );
      assert.deepEqual(
        response.factReferences.map((reference) => reference.sourceId),
        expected.sourceIds
      );
      assert.equal(response.specialistNpcId, expected.specialistNpcId);
      assert.equal(response.destinationZoneId, expected.destinationZoneId);
      assert.equal(response.knowledgeVersion, snapshots[evaluation.stage].knowledgeVersion);
      if (response.destinationZoneId !== null) {
        assert.ok(response.specialistName?.startsWith('Fictional'));
        assert.ok(response.destinationZoneName?.startsWith('Fictional'));
        assert.match(response.canonicalDirections, /^From the fictional guide marker/);
      }
    });
  }
});
