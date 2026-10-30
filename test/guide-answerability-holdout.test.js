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
  new URL('../knowledge/guide-answerability-holdout.fixture.v1.json', import.meta.url)
);
const holdout = JSON.parse(holdoutBytes.toString('utf8'));
const recordedResult = JSON.parse(readFileSync(
  new URL('../knowledge/guide-answerability-holdout-results.v1.json', import.meta.url),
  'utf8'
));
const afterGeneralizationResult = JSON.parse(readFileSync(
  new URL('../knowledge/guide-answerability-holdout-after-generalization.v1.json', import.meta.url),
  'utf8'
));
const expectedHash = 'f2cc23c851d43c1d4ff950b458288d2855b53ee3aef12e25e1c7c875c6ecb7fe';
const allowedOrigin = 'https://answerability-holdout.example.test';
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
      requestId: `answerability-holdout-${requestSequence}`,
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
  return { status: response.status, body: await response.json() };
}

test('frozen answerability holdout preserves first-run and final measured metrics', async () => {
  assert.equal(createHash('sha256').update(holdoutBytes).digest('hex'), expectedHash);
  assert.equal(holdout.contentClassification, 'synthetic_fixture');
  assert.equal(holdout.cases.length, 30);
  assert.equal(new Set(holdout.cases.map((entry) => entry.id)).size, 30);

  const { knowledge, profile } = retrievalQualityFixture();
  const approved = createApprovedKnowledgeView(knowledge).knowledge;
  const facts = new Map(approved.facts.map((fact) => [fact.id, fact]));
  const retriever = createApprovedKnowledgeRetriever(approved, { retrievalProfile: profile });
  const directCases = holdout.cases.filter((entry) => !entry.contextQuestion);
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

  for (const entry of directCases) {
    const actual = retriever.search(entry.question, { limit: 4 });
    assert.ok(actual.results.every((result) => {
      const fact = facts.get(result.factId);
      return fact?.sourceId === result.sourceId && fact?.sourceLocation === result.sourceLocation;
    }), `${entry.id}: authoritative fact/source/location binding`);
    const expected = entry.expected;
    const factIds = actual.results.map((result) => result.factId);
    if (expected.outcome === 'matched') {
      metrics.supported += 1;
      metrics.expectedFacts += expected.factIds.length;
      metrics.recalledFacts += expected.factIds.filter((id) => factIds.includes(id)).length;
      if (actual.outcome === 'matched' && actual.topicId === expected.topicId &&
          expected.factIds.includes(factIds[0])) metrics.top1Correct += 1;
      const citationsAreCorrect = actual.outcome === 'matched' &&
        actual.topicId === expected.topicId && factIds.length > 0 &&
        factIds.every((id) => expected.factIds.includes(id));
      if (citationsAreCorrect) metrics.citationCorrect += 1;
      if (!citationsAreCorrect || JSON.stringify(factIds) !== JSON.stringify(expected.factIds)) {
        directFailures.push(entry.id);
      }
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
          answerText: 'Untrusted new-holdout prose that must be discarded.',
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
      const setup = await responseBody(handler, entry.contextQuestion);
      if (setup.status === 200 && setup.body.outcome === 'answered') context = contextFrom(setup.body);
    }
    const response = await responseBody(handler, entry.question, context);
    const expected = entry.expected;
    const factIds = response.body.factReferences?.map((reference) => reference.factId) ?? [];
    const sourceIds = [...new Set(
      response.body.factReferences?.map((reference) => reference.sourceId) ?? []
    )];
    const passed = response.status === 200 &&
      response.body.outcome === workerOutcome(expected.outcome) &&
      response.body.topicId === expected.topicId &&
      JSON.stringify(factIds) === JSON.stringify(expected.factIds) &&
      JSON.stringify(sourceIds) === JSON.stringify(expected.sourceIds);
    if (!passed) workerFailures.push(entry.id);
    assert.doesNotMatch(response.body.answerText ?? '', /Untrusted new-holdout prose/);
  }

  const report = Object.freeze({
    evaluationVersion: holdout.evaluationVersion,
    holdoutSha256: expectedHash,
    directCases: directCases.length,
    conversationCases: holdout.cases.length - directCases.length,
    metrics,
    directFailures,
    workerPassed: holdout.cases.length - workerFailures.length,
    workerFailures
  });
  console.log(`ANSWERABILITY_HOLDOUT_RESULT=${JSON.stringify(report)}`);

  const measuredResult = {
    directCases: report.directCases,
    conversationCases: report.conversationCases,
    metrics: report.metrics,
    directFailures: report.directFailures,
    workerPassed: report.workerPassed,
    workerFailures: report.workerFailures
  };
  assert.equal(recordedResult.firstRun.measurement,
    'first_run_before_holdout_review_or_tuning');
  assert.equal(recordedResult.finalImplementationRun.measurement,
    'post_first_run_after_old_diagnostic_regression_fixes_not_unseen');
  assert.deepEqual(recordedResult.firstRun.metrics, {
    supported: 10,
    top1Correct: 0,
    expectedFacts: 11,
    recalledFacts: 0,
    unsupported: 12,
    falseSupported: 0,
    ambiguityOrConflict: 4,
    ambiguityOrConflictCorrect: 0,
    citationCorrect: 0
  });
  assert.equal(recordedResult.firstRun.workerPassed, 14);
  assert.equal(afterGeneralizationResult.measurement,
    'after_reviewed_property_generalization_diagnostic_not_unseen');
  assert.equal(afterGeneralizationResult.holdoutSha256, expectedHash);
  assert.deepEqual(measuredResult, {
    directCases: afterGeneralizationResult.directCases,
    conversationCases: afterGeneralizationResult.conversationCases,
    metrics: afterGeneralizationResult.metrics,
    directFailures: afterGeneralizationResult.directFailures,
    workerPassed: afterGeneralizationResult.workerPassed,
    workerFailures: afterGeneralizationResult.workerFailures
  });
  assert.equal(recordedResult.evaluationVersion, holdout.evaluationVersion);
  assert.equal(recordedResult.holdoutSha256, expectedHash);
  assert.equal(metrics.supported + metrics.unsupported + metrics.ambiguityOrConflict, 26);
  assert.equal(report.workerPassed + workerFailures.length, 30);
});
