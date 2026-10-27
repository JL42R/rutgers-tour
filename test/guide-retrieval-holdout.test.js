import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createApprovedKnowledgeRetriever } from '../src/guide-knowledge-retrieval.js';
import { createApprovedKnowledgeView } from '../src/guide-knowledge-schema.js';
import { retrievalQualityFixture } from '../test-support/guide-retrieval-quality-fixture.js';
import { createStaticApprovedKnowledgeLoader } from '../worker/src/approved-knowledge.js';
import { createGuideHandler } from '../worker/src/guide-handler.js';

const holdoutBytes = readFileSync(
  new URL('../knowledge/guide-retrieval-quality-holdout.fixture.v1.json', import.meta.url)
);
const holdout = JSON.parse(holdoutBytes.toString('utf8'));
const recordedResult = JSON.parse(readFileSync(
  new URL('../knowledge/guide-retrieval-quality-holdout-results.v1.json', import.meta.url),
  'utf8'
));
const afterAnswerabilityResult = JSON.parse(readFileSync(
  new URL('../knowledge/guide-retrieval-quality-holdout-after-answerability.v1.json', import.meta.url),
  'utf8'
));
const expectedHoldoutHash = 'bb9c93c0524886e9af5beb4f57b069180a707bfb7870d39701d89db0a54f6764';
const allowedOrigin = 'https://retrieval-holdout.example.test';
let requestSequence = 0;

function directCases() {
  return holdout.cases.filter((entry) => !Object.hasOwn(entry, 'contextQuestion'));
}

function expectedWorkerOutcome(outcome) {
  if (outcome === 'matched') return 'answered';
  if (outcome === 'ambiguous' || outcome === 'conflict') return 'clarify';
  return outcome;
}

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
      Origin: allowedOrigin
    },
    body: JSON.stringify({
      schemaVersion: '1.1',
      requestId: `holdout-${requestSequence}`,
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

async function bodyFor(handler, question, context) {
  const response = await handler(requestFor(question, context));
  return { status: response.status, body: await response.json() };
}

test('fixed diagnostic preserves its first run and verifies the post-answerability result', async () => {
  assert.equal(createHash('sha256').update(holdoutBytes).digest('hex'), expectedHoldoutHash);
  assert.equal(holdout.contentClassification, 'synthetic_fixture');
  assert.equal(holdout.cases.length, 20);
  assert.equal(directCases().length, 17);
  assert.equal(new Set(holdout.cases.map((entry) => entry.id)).size, 20);

  const { knowledge, profile } = retrievalQualityFixture();
  const approved = createApprovedKnowledgeView(knowledge).knowledge;
  const facts = new Map(approved.facts.map((fact) => [fact.id, fact]));
  const retriever = createApprovedKnowledgeRetriever(approved, { retrievalProfile: profile });
  const metrics = {
    supported: 0,
    top1Correct: 0,
    expectedFacts: 0,
    recalledFacts: 0,
    unsupported: 0,
    falseSupported: 0,
    ambiguityOrConflict: 0,
    ambiguityOrConflictCorrect: 0,
    citationCorrect: 0
  };
  const directFailures = [];

  for (const entry of directCases()) {
    const actual = retriever.search(entry.question, { limit: 4 });
    const expected = entry.expected;
    assert.ok(actual.results.every((result) => {
      const fact = facts.get(result.factId);
      return fact?.sourceId === result.sourceId && fact?.sourceLocation === result.sourceLocation;
    }), `${entry.id}: retrieval emitted only authoritative approved bindings`);

    if (expected.outcome === 'matched') {
      metrics.supported += 1;
      metrics.expectedFacts += expected.factIds.length;
      const actualFactIds = actual.results.map((result) => result.factId);
      metrics.recalledFacts += expected.factIds.filter((id) => actualFactIds.includes(id)).length;
      if (actual.outcome === 'matched' && actual.topicId === expected.topicId &&
          expected.factIds.includes(actualFactIds[0])) {
        metrics.top1Correct += 1;
      }
      const citationCorrect = actual.outcome === 'matched' &&
        actual.topicId === expected.topicId && actual.results.length > 0 &&
        actual.results.every((result) => expected.factIds.includes(result.factId));
      if (citationCorrect) metrics.citationCorrect += 1;
      if (!citationCorrect) directFailures.push(entry.id);
      continue;
    }
    if (expected.outcome === 'unsupported') {
      metrics.unsupported += 1;
      if (actual.outcome === 'matched') metrics.falseSupported += 1;
      if (actual.outcome !== 'unsupported') directFailures.push(entry.id);
      continue;
    }
    metrics.ambiguityOrConflict += 1;
    if (actual.outcome === expected.outcome) metrics.ambiguityOrConflictCorrect += 1;
    else directFailures.push(entry.id);
  }

  const handler = createGuideHandler({
    loadKnowledge: createStaticApprovedKnowledgeLoader(knowledge, { retrievalProfile: profile }),
    model: {
      generateResponse(request) {
        return {
          answerText: 'Untrusted holdout prose that must be discarded.',
          supported: true,
          topicId: request.topicId,
          usedFactIds: request.allowedFactIds
        };
      }
    },
    allowedOrigins: [allowedOrigin]
  });
  const workerFailures = [];
  for (const entry of holdout.cases) {
    let context;
    if (entry.contextQuestion) {
      const contextResult = await bodyFor(handler, entry.contextQuestion);
      if (contextResult.status === 200 && contextResult.body.outcome === 'answered') {
        context = contextFrom(contextResult.body);
      }
    }
    const response = await bodyFor(handler, entry.question, context);
    const expected = entry.expected;
    const actualFactIds = response.body.factReferences?.map((reference) => reference.factId) ?? [];
    const actualSourceIds = [...new Set(
      response.body.factReferences?.map((reference) => reference.sourceId) ?? []
    )];
    const matched = response.body.outcome === expectedWorkerOutcome(expected.outcome) &&
      response.body.topicId === expected.topicId &&
      JSON.stringify(actualFactIds) === JSON.stringify(expected.factIds) &&
      JSON.stringify(actualSourceIds) === JSON.stringify(expected.sourceIds);
    if (!matched) workerFailures.push(entry.id);
    assert.doesNotMatch(response.body.answerText ?? '', /Untrusted holdout prose/);
  }

  const report = Object.freeze({
    evaluationVersion: holdout.evaluationVersion,
    holdoutSha256: expectedHoldoutHash,
    directCases: directCases().length,
    conversationCases: holdout.cases.length - directCases().length,
    metrics,
    directFailures,
    workerPassed: holdout.cases.length - workerFailures.length,
    workerFailures
  });
  console.log(`HOLDOUT_RESULT=${JSON.stringify(report)}`);

  assert.deepEqual(recordedResult, {
    schemaVersion: '1.0',
    evaluationVersion: 'fictional-retrieval-holdout-2026-10-25.1',
    knowledgeVersion: 'fictional-retrieval-quality-2026-10-25.1',
    contentClassification: 'synthetic_fixture',
    holdoutSha256: expectedHoldoutHash,
    measurement: 'first_run_before_holdout_review_or_retrieval_tuning',
    directCases: 17,
    conversationCases: 3,
    metrics: {
      supported: 8,
      top1Correct: 7,
      expectedFacts: 9,
      recalledFacts: 8,
      unsupported: 5,
      falseSupported: 4,
      ambiguityOrConflict: 4,
      ambiguityOrConflictCorrect: 4,
      citationCorrect: 6
    },
    directFailures: [
      'holdout-folded-amber-reset',
      'holdout-orchard-token-food',
      'holdout-unsupported-automata-speed',
      'holdout-unsupported-prism-chemicals',
      'holdout-unsupported-span-emergency-load',
      'holdout-unsupported-orchard-purchase'
    ],
    workerPassed: 14,
    workerFailures: [
      'holdout-folded-amber-reset',
      'holdout-orchard-token-food',
      'holdout-unsupported-automata-speed',
      'holdout-unsupported-prism-chemicals',
      'holdout-unsupported-span-emergency-load',
      'holdout-unsupported-orchard-purchase'
    ],
    notes: recordedResult.notes
  });
  assert.deepEqual(report, {
    evaluationVersion: afterAnswerabilityResult.evaluationVersion,
    holdoutSha256: afterAnswerabilityResult.holdoutSha256,
    directCases: afterAnswerabilityResult.directCases,
    conversationCases: afterAnswerabilityResult.conversationCases,
    metrics: afterAnswerabilityResult.metrics,
    directFailures: afterAnswerabilityResult.directFailures,
    workerPassed: afterAnswerabilityResult.workerPassed,
    workerFailures: afterAnswerabilityResult.workerFailures
  });
  assert.equal(metrics.supported + metrics.unsupported + metrics.ambiguityOrConflict, 17);
  assert.equal(metrics.expectedFacts > 0, true);
  assert.equal(metrics.falseSupported <= metrics.unsupported, true);
  assert.equal(report.workerPassed + workerFailures.length, 20);
});
