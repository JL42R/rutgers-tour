import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createApprovedKnowledgeRetriever } from '../src/guide-knowledge-retrieval.js';
import { createApprovedKnowledgeView } from '../src/guide-knowledge-schema.js';
import { retrievalQualityFixture } from '../test-support/guide-retrieval-quality-fixture.js';
import { createStaticApprovedKnowledgeLoader } from '../worker/src/approved-knowledge.js';
import { createGuideHandler } from '../worker/src/guide-handler.js';

const challengeBytes = readFileSync(
  new URL('../knowledge/guide-generalization-challenge.fixture.v1.json', import.meta.url)
);
const challenge = JSON.parse(challengeBytes.toString('utf8'));
const recordedResult = JSON.parse(readFileSync(
  new URL('../knowledge/guide-generalization-challenge-results.v1.json', import.meta.url),
  'utf8'
));
const expectedHash = '265966a4ea20466aa16c1a6302f87fb175c263c35a2dc8801d0cf9db25159687';
const allowedOrigin = 'https://generalization-challenge.example.test';
let requestSequence = 0;

function sorted(values) {
  return [...values].sort();
}

function sameIds(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

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
      requestId: `generalization-challenge-${requestSequence}`,
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

test('prospectively frozen synthetic generalization challenge reports first-run metrics', async () => {
  assert.equal(createHash('sha256').update(challengeBytes).digest('hex'), expectedHash);
  assert.equal(challenge.contentClassification, 'synthetic_fixture');
  assert.equal(challenge.cases.length, 44);
  assert.equal(new Set(challenge.cases.map((entry) => entry.id)).size, 44);
  assert.deepEqual(Object.fromEntries(
    ['supported', 'unsupported', 'ambiguous_conflict', 'multi_fact', 'context']
      .map((group) => [group, challenge.cases.filter((entry) => entry.group === group).length])
  ), { supported: 12, unsupported: 12, ambiguous_conflict: 6, multi_fact: 8, context: 6 });

  const { knowledge, profile } = retrievalQualityFixture();
  const approved = createApprovedKnowledgeView(knowledge).knowledge;
  const facts = new Map(approved.facts.map((fact) => [fact.id, fact]));
  const retriever = createApprovedKnowledgeRetriever(approved, { retrievalProfile: profile });
  const directCases = challenge.cases.filter((entry) => !entry.contextQuestion);
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
    const expected = entry.expected;
    const factIds = actual.results.map((result) => result.factId);
    assert.ok(actual.results.every((result) => {
      const fact = facts.get(result.factId);
      return fact?.sourceId === result.sourceId && fact?.sourceLocation === result.sourceLocation;
    }), `${entry.id}: authoritative source binding`);

    if (expected.outcome === 'matched') {
      metrics.supported += 1;
      metrics.expectedFacts += expected.factIds.length;
      metrics.recalledFacts += expected.factIds.filter((id) => factIds.includes(id)).length;
      if (actual.outcome === 'matched' && actual.topicId === expected.topicId &&
          expected.factIds.includes(factIds[0])) metrics.top1Correct += 1;
      const correct = actual.outcome === 'matched' && actual.topicId === expected.topicId &&
        sameIds(factIds, expected.factIds);
      if (correct) metrics.citationCorrect += 1;
      else directFailures.push(entry.id);
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
          answerText: 'Untrusted challenge prose that must be discarded.',
          supported: true,
          topicId: request.topicId,
          usedFactIds: request.allowedFactIds
        };
      }
    },
    allowedOrigins: [allowedOrigin]
  });
  const workerFailures = [];
  for (const entry of challenge.cases) {
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
    const specialistIds = response.body.specialistNpcId ? [response.body.specialistNpcId] : [];
    const destinationZoneIds = response.body.destinationZoneId
      ? [response.body.destinationZoneId]
      : [];
    const passed = response.status === 200 &&
      response.body.outcome === workerOutcome(expected.outcome) &&
      response.body.topicId === expected.topicId &&
      sameIds(factIds, expected.factIds) &&
      sameIds(sourceIds, expected.sourceIds) &&
      sameIds(specialistIds, expected.specialistIds) &&
      sameIds(destinationZoneIds, expected.destinationZoneIds);
    if (!passed) workerFailures.push(entry.id);
    assert.doesNotMatch(response.body.answerText ?? '', /Untrusted challenge prose/);
  }

  const report = Object.freeze({
    evaluationVersion: challenge.evaluationVersion,
    challengeSha256: expectedHash,
    directCases: directCases.length,
    conversationCases: challenge.cases.length - directCases.length,
    metrics,
    directFailures,
    workerPassed: challenge.cases.length - workerFailures.length,
    workerFailures
  });
  console.log(`GENERALIZATION_CHALLENGE_RESULT=${JSON.stringify(report)}`);
  assert.deepEqual(report, {
    evaluationVersion: recordedResult.evaluationVersion,
    challengeSha256: recordedResult.challengeSha256,
    directCases: recordedResult.directCases,
    conversationCases: recordedResult.conversationCases,
    metrics: recordedResult.metrics,
    directFailures: recordedResult.directFailures,
    workerPassed: recordedResult.workerPassed,
    workerFailures: recordedResult.workerFailures
  });
  assert.equal(metrics.supported + metrics.unsupported + metrics.ambiguityOrConflict,
    directCases.length);
  assert.equal(report.workerPassed + workerFailures.length, challenge.cases.length);
});
