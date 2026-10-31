import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createApprovedKnowledgeRetriever } from '../src/guide-knowledge-retrieval.js';
import { createApprovedKnowledgeView } from '../src/guide-knowledge-schema.js';
import { retrievalQualityFixture } from '../test-support/guide-retrieval-quality-fixture.js';
import { createStaticApprovedKnowledgeLoader } from '../worker/src/approved-knowledge.js';
import { createGuideHandler } from '../worker/src/guide-handler.js';

const evaluation = JSON.parse(readFileSync(
  new URL('../knowledge/guide-answerability-development.fixture.v1.json', import.meta.url),
  'utf8'
));
const allowedOrigin = 'https://answerability-development.example.test';
let requestSequence = 0;

function workerOutcome(outcome) {
  if (outcome === 'matched') return 'answered';
  if (outcome === 'ambiguous' || outcome === 'conflict') return 'clarify';
  return outcome;
}

function requestFor(question, temporaryContext = {
  topicIds: [], specialistNpcIds: [], destinationZoneIds: []
}) {
  requestSequence += 1;
  return new Request('https://worker.example.test/guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: allowedOrigin },
    body: JSON.stringify({
      schemaVersion: '1.1',
      requestId: `answerability-development-${requestSequence}`,
      question,
      temporaryContext
    })
  });
}

function contextFrom(body) {
  return {
    topicIds: body.topicId ? [body.topicId] : [],
    specialistNpcIds: body.specialistNpcId ? [body.specialistNpcId] : [],
    destinationZoneIds: body.destinationZoneId ? [body.destinationZoneId] : []
  };
}

async function responseBody(handler, question, context) {
  const response = await handler(requestFor(question, context));
  assert.equal(response.status, 200);
  return response.json();
}

test('diagnosed answerability development cases pass retrieval and the actual Worker path', async () => {
  assert.equal(evaluation.contentClassification, 'synthetic_fixture');
  assert.equal(evaluation.cases.length, 20);
  assert.equal(new Set(evaluation.cases.map((entry) => entry.id)).size, 20);
  assert.equal(evaluation.cases.filter((entry) => entry.originCaseId).length, 6);

  const { knowledge, profile } = retrievalQualityFixture();
  const approved = createApprovedKnowledgeView(knowledge).knowledge;
  const retriever = createApprovedKnowledgeRetriever(approved, { retrievalProfile: profile });

  for (const entry of evaluation.cases.filter((value) => !value.contextQuestion)) {
    const actual = retriever.search(entry.question, { limit: 4 });
    assert.equal(actual.outcome, entry.expected.outcome, `${entry.id}: retrieval outcome`);
    assert.equal(actual.topicId, entry.expected.topicId, `${entry.id}: retrieval topic`);
    assert.deepEqual(
      actual.results.map((result) => result.factId),
      entry.expected.factIds,
      `${entry.id}: retrieval facts`
    );
    assert.deepEqual(
      [...new Set(actual.results.map((result) => result.sourceId))],
      entry.expected.sourceIds,
      `${entry.id}: retrieval sources`
    );
  }

  let providerCalls = 0;
  const handler = createGuideHandler({
    loadKnowledge: createStaticApprovedKnowledgeLoader(knowledge, { retrievalProfile: profile }),
    model: {
      generateResponse(request) {
        providerCalls += 1;
        return {
          answerText: 'Untrusted development prose that must be discarded.',
          supported: true,
          topicId: request.topicId,
          usedFactIds: request.allowedFactIds
        };
      }
    },
    allowedOrigins: [allowedOrigin]
  });

  for (const entry of evaluation.cases) {
    let context;
    if (entry.contextQuestion) {
      const setup = await responseBody(handler, entry.contextQuestion);
      assert.equal(setup.outcome, 'answered', `${entry.id}: context setup`);
      context = contextFrom(setup);
    }
    const actual = await responseBody(handler, entry.question, context);
    assert.equal(actual.outcome, workerOutcome(entry.expected.outcome), `${entry.id}: Worker outcome`);
    assert.equal(actual.topicId, entry.expected.topicId, `${entry.id}: Worker topic`);
    assert.deepEqual(
      actual.factReferences.map((reference) => reference.factId),
      entry.expected.factIds,
      `${entry.id}: Worker facts`
    );
    assert.deepEqual(
      [...new Set(actual.factReferences.map((reference) => reference.sourceId))],
      entry.expected.sourceIds,
      `${entry.id}: Worker sources`
    );
    assert.doesNotMatch(actual.answerText, /Untrusted development prose/);
    if (entry.expected.outcome === 'unsupported') {
      assert.equal(actual.specialistNpcId, null);
      assert.equal(actual.destinationZoneId, null);
      assert.equal(actual.canonicalDirections, null);
    }
  }

  assert.ok(providerCalls > 0);
});
