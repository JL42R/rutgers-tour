import test from 'node:test';
import assert from 'node:assert/strict';
import { matchQuestion } from '../src/guide-qa.js';
import {
  createConversationState, clearConversationState, handleGuideQuestion
} from '../src/guide-conversation.js';

import {
  createModelRequest,
  orchestrateGuideQuestion,
  validateModelResponse
} from '../src/guide-ai-orchestrator.js';

const paperAnswer = Object.freeze({
  type: 'answer',
  topicId: 'paper-robotics',
  response: 'Paper robotics uses folded paper mechanisms.',
  score: 5
});

const paperRoute = Object.freeze({
  type: 'route',
  topicId: 'paper-specialist',
  response: 'Ask the paper specialist.',
  destinationNpcId: 'npc-paper-specialist',
  destinationZoneId: 'printing-room',
  score: 7
});

const deterministicFallback = Object.freeze({
  type: 'fallback',
  topicId: null,
  response: 'That subject is outside the fictional guide.',
  score: 0
});

const deterministicClarification = Object.freeze({
  type: 'clarify',
  topicId: null,
  response: 'Do you mean paper robotics or glass-engine design?',
  score: 3
});

const knowledge = Object.freeze({
  topics: Object.freeze([
    Object.freeze({
      id: 'paper-robotics',
      status: 'verified',
      type: 'answer',
      response: paperAnswer.response,
      phrases: Object.freeze(['paper robotics']),
      facts: Object.freeze([
        Object.freeze({
          id: 'paper-folds',
          status: 'approved',
          text: 'Fictional paper robots use folded paper mechanisms.'
        }),
        Object.freeze({
          id: 'paper-motion',
          status: 'approved',
          text: 'Fictional paper robots demonstrate mechanical motion.'
        }),
        Object.freeze({
          id: 'paper-draft',
          status: 'candidate',
          text: 'This draft fact must never be sent to the model.'
        })
      ])
    }),
    Object.freeze({
      id: 'paper-specialist',
      status: 'verified',
      type: 'route',
      response: paperRoute.response,
      destinationNpcId: paperRoute.destinationNpcId,
      destinationZoneId: paperRoute.destinationZoneId,
      phrases: Object.freeze(['paper specialist']),
      facts: Object.freeze([
        Object.freeze({ id: 'paper-folds', status: 'approved', text: 'Synthetic paper mechanisms.' }),
        Object.freeze({ id: 'paper-motion', status: 'approved', text: 'Synthetic mechanical motion.' })
      ])
    }),
    Object.freeze({
      id: 'glass-engine-design',
      status: 'verified',
      facts: Object.freeze([
        Object.freeze({
          id: 'glass-models',
          status: 'approved',
          text: 'Fictional glass-engine models demonstrate transparent components.'
        })
      ])
    }),
    Object.freeze({
      id: 'unverified-model-workshop',
      status: 'candidate',
      facts: Object.freeze([
        Object.freeze({
          id: 'workshop-draft',
          status: 'approved',
          text: 'This belongs to an unverified fictional topic.'
        })
      ])
    })
  ]),
  specialists: Object.freeze([
    Object.freeze({
      id: 'npc-paper-specialist',
      status: 'approved',
      zoneId: 'printing-room',
      topicIds: Object.freeze(['paper-specialist']),
      directions: 'Go to the fictional model workshop.'
    }),
    Object.freeze({
      id: 'npc-glass-specialist',
      status: 'approved',
      zoneId: 'project-studio',
      topicIds: Object.freeze(['glass-engine-design']),
      directions: 'Go to the fictional glass lab.'
    })
  ]),
  zones: Object.freeze([
    Object.freeze({ id: 'printing-room', status: 'approved' }),
    Object.freeze({ id: 'project-studio', status: 'approved' })
  ])
});

const modelAnswer = Object.freeze({
  supported: true,
  topicId: 'paper-robotics',
  answerText: 'The fictional paper robots turn folded structures into moving mechanisms.',
  usedFactIds: Object.freeze(['paper-folds', 'paper-motion'])
});

function resolverReturning(result) {
  return () => result;
}

function optionsFor(result, generateResponse = () => ({ ...modelAnswer, topicId: result.topicId }), extra = {}) {
  return {
    resolveQuestion: resolverReturning(result),
    generateResponse,
    ...extra
  };
}

test('supported questions invoke the simulated model', async () => {
  let calls = 0;
  const generateResponse = () => {
    calls += 1;
    return modelAnswer;
  };

  const outcome = await orchestrateGuideQuestion(
    'How do paper robots move?',
    knowledge,
    {},
    optionsFor(paperAnswer, generateResponse)
  );

  assert.equal(calls, 1);
  assert.equal(outcome.result.type, 'answer');
  assert.equal(outcome.result.response, modelAnswer.answerText);
});

test('only approved facts and allowed fact IDs are passed to the model', async () => {
  let request;
  const generateResponse = (received) => {
    request = received;
    return modelAnswer;
  };

  await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer, generateResponse)
  );

  assert.equal(request.visitorQuestion, 'Explain paper robotics.');
  assert.equal(request.topicId, 'paper-robotics');
  assert.deepEqual(request.facts, [
    { id: 'paper-folds', text: 'Fictional paper robots use folded paper mechanisms.' },
    { id: 'paper-motion', text: 'Fictional paper robots demonstrate mechanical motion.' }
  ]);
  assert.deepEqual(request.allowedFactIds, ['paper-folds', 'paper-motion']);
  assert.equal(JSON.stringify(request).includes('paper-draft'), false);
  assert.equal(Object.isFrozen(request), true);
});

test('unsupported questions never invoke the model', async () => {
  let calls = 0;
  const outcome = await orchestrateGuideQuestion(
    'What is the weather?',
    knowledge,
    {},
    optionsFor(deterministicFallback, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.deepEqual(outcome.result, deterministicFallback);
});

test('ambiguous questions never invoke the model', async () => {
  let calls = 0;
  const outcome = await orchestrateGuideQuestion(
    'Tell me about design.',
    knowledge,
    {},
    optionsFor(deterministicClarification, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.deepEqual(outcome.result, deterministicClarification);
});

test('unverified topics never invoke the model', async () => {
  let calls = 0;
  const unverified = {
    ...paperAnswer,
    topicId: 'unverified-model-workshop',
    response: 'Unverified deterministic text.'
  };
  const outcome = await orchestrateGuideQuestion(
    'Tell me about the model workshop.',
    knowledge,
    {},
    optionsFor(unverified, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
  assert.notEqual(outcome.result.response, unverified.response);
});

test('duplicate topic IDs are rejected before model generation', async () => {
  let calls = 0;
  const duplicatedKnowledge = {
    ...knowledge,
    topics: [...knowledge.topics, { ...knowledge.topics[0] }]
  };
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    duplicatedKnowledge,
    {},
    optionsFor(paperAnswer, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('invalid model output returns the deterministic answer', async () => {
  const invalidOutputs = [
    null,
    'answer',
    [],
    {},
    { ...modelAnswer, supported: false },
    { ...modelAnswer, answerText: ' ' },
    { ...modelAnswer, usedFactIds: [] },
    { ...modelAnswer, extra: true }
  ];

  for (const output of invalidOutputs) {
    const outcome = await orchestrateGuideQuestion(
      'Explain paper robotics.',
      knowledge,
      {},
      optionsFor(paperAnswer, () => output)
    );

    assert.deepEqual(outcome.result, paperAnswer);
  }
});

test('model errors return the deterministic answer', async () => {
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer, () => { throw new Error('Synthetic model error'); })
  );

  assert.deepEqual(outcome.result, paperAnswer);
});

test('rejected model promises return the deterministic answer', async () => {
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer, () => Promise.reject(new Error('Synthetic rejection')))
  );

  assert.deepEqual(outcome.result, paperAnswer);
});

test('model timeouts return the deterministic answer', async () => {
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer, () => new Promise(() => {}), { modelTimeoutMs: 5 })
  );

  assert.deepEqual(outcome.result, paperAnswer);
});

test('fabricated model topic IDs are rejected', async () => {
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer, () => ({ ...modelAnswer, topicId: 'invented-topic' }))
  );

  assert.deepEqual(outcome.result, paperAnswer);
});

test('unknown model fact IDs are rejected', async () => {
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer, () => ({ ...modelAnswer, usedFactIds: ['invented-fact'] }))
  );

  assert.deepEqual(outcome.result, paperAnswer);
});

test('overlong model answers are rejected', async () => {
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(
      paperAnswer,
      () => ({ ...modelAnswer, answerText: 'x'.repeat(21) }),
      { maxAnswerLength: 20 }
    )
  );

  assert.deepEqual(outcome.result, paperAnswer);
});

test('invalid specialist IDs are rejected before model generation', async () => {
  let calls = 0;
  const invalidRoute = { ...paperRoute, destinationNpcId: 'npc-missing' };
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    knowledge,
    {},
    optionsFor(invalidRoute, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('invalid destination zones are rejected before model generation', async () => {
  let calls = 0;
  const invalidRoute = { ...paperRoute, destinationZoneId: 'zone-missing' };
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    knowledge,
    {},
    optionsFor(invalidRoute, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('unapproved specialists are rejected', async () => {
  let calls = 0;
  const unapprovedKnowledge = {
    ...knowledge,
    specialists: [{ ...knowledge.specialists[0], status: 'candidate' }]
  };
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    unapprovedKnowledge,
    {},
    optionsFor(paperRoute, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('specialists not approved for the canonical topic are rejected', async () => {
  let calls = 0;
  const wrongTopicKnowledge = {
    ...knowledge,
    specialists: [{
      ...knowledge.specialists[0],
      topicIds: ['glass-engine-design']
    }]
  };
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    wrongTopicKnowledge,
    {},
    optionsFor(paperRoute, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('unapproved zones are rejected', async () => {
  let calls = 0;
  const unapprovedKnowledge = {
    ...knowledge,
    zones: [{ ...knowledge.zones[0], status: 'candidate' }]
  };
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    unapprovedKnowledge,
    {},
    optionsFor(paperRoute, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('duplicate specialist IDs are rejected', async () => {
  let calls = 0;
  const duplicatedKnowledge = {
    ...knowledge,
    specialists: [
      ...knowledge.specialists,
      { ...knowledge.specialists[0], status: 'candidate' }
    ]
  };
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    duplicatedKnowledge,
    {},
    optionsFor(paperRoute, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('duplicate zone IDs are rejected', async () => {
  let calls = 0;
  const duplicatedKnowledge = {
    ...knowledge,
    zones: [
      ...knowledge.zones,
      { ...knowledge.zones[0], status: 'candidate' }
    ]
  };
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    duplicatedKnowledge,
    {},
    optionsFor(paperRoute, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('model-generated directions cannot override canonical directions', async () => {
  const attemptedOverride = {
    ...modelAnswer,
    directions: 'Go to an invented destination.'
  };
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    knowledge,
    {},
    optionsFor(paperRoute, () => attemptedOverride)
  );

  assert.equal(outcome.result.response, paperRoute.response);
  assert.equal(outcome.result.destinationNpcId, 'npc-paper-specialist');
  assert.equal(outcome.result.destinationZoneId, 'printing-room');
  assert.equal(outcome.result.directions, 'Go to the fictional model workshop.');
});

test('valid specialist recommendations preserve canonical routing', async () => {
  const outcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    knowledge,
    {},
    optionsFor(paperRoute)
  );

  assert.equal(outcome.result.type, 'route');
  assert.equal(outcome.result.response, modelAnswer.answerText);
  assert.equal(outcome.result.destinationNpcId, 'npc-paper-specialist');
  assert.equal(outcome.result.destinationZoneId, 'printing-room');
  assert.equal(outcome.result.directions, 'Go to the fictional model workshop.');
});

test('contextual follow-up envelopes are processed without duplicating memory logic', async () => {
  const nextState = Object.freeze({
    lastTopicId: 'paper-robotics',
    lastDestinationNpcId: 'npc-paper-specialist',
    lastDestinationZoneId: 'printing-room',
    history: ['This must not reach the model.']
  });
  const resolver = () => ({ result: paperAnswer, state: nextState });
  let request;
  const outcome = await orchestrateGuideQuestion(
    'What do they specialize in?',
    knowledge,
    {},
    {
      resolveQuestion: resolver,
      generateResponse: (received) => {
        request = received;
        return modelAnswer;
      }
    }
  );

  assert.equal(outcome.result.response, modelAnswer.answerText);
  assert.equal(outcome.state, nextState);
  assert.deepEqual(request.context, {
    lastTopicId: 'paper-robotics',
    lastDestinationNpcId: 'npc-paper-specialist',
    lastDestinationZoneId: 'printing-room'
  });
  assert.equal('history' in request.context, false);
});

test('Stage 3 specialist follow-ups preserve canonical deterministic answers', async () => {
  const nextState = Object.freeze({
    lastTopicId: 'paper-specialist',
    lastDestinationNpcId: 'npc-paper-specialist',
    lastDestinationZoneId: 'printing-room'
  });
  const contextualAnswer = Object.freeze({
    type: 'answer',
    topicId: 'paper-specialist',
    response: 'Go to the fictional model workshop.',
    destinationNpcId: 'npc-paper-specialist',
    destinationZoneId: 'printing-room',
    score: 0
  });
  let modelCalls = 0;
  const outcome = await orchestrateGuideQuestion(
    'Where can I find them?',
    knowledge,
    {},
    {
      resolveQuestion: () => ({ result: contextualAnswer, state: nextState }),
      generateResponse: () => {
        modelCalls += 1;
        return { ...modelAnswer, answerText: 'Go to an invented location.' };
      }
    }
  );

  assert.equal(modelCalls, 0);
  assert.deepEqual(outcome.result, contextualAnswer);
  assert.equal(outcome.state, nextState);
});

test('Stage 3 expertise follow-ups do not require specialist directions', async () => {
  const expertiseKnowledge = {
    ...knowledge,
    specialists: [{
      ...knowledge.specialists[0],
      directions: undefined,
      expertise: 'The fictional specialist teaches paper mechanisms.'
    }]
  };
  const contextualAnswer = {
    type: 'answer',
    topicId: 'paper-specialist',
    response: 'The fictional specialist teaches paper mechanisms.',
    destinationNpcId: 'npc-paper-specialist',
    destinationZoneId: 'printing-room',
    score: 0
  };
  let modelCalls = 0;
  const outcome = await orchestrateGuideQuestion(
    'What do they specialize in?',
    expertiseKnowledge,
    {},
    {
      resolveQuestion: () => ({ result: contextualAnswer, state: {} }),
      generateResponse: () => {
        modelCalls += 1;
        return modelAnswer;
      }
    }
  );

  assert.equal(modelCalls, 0);
  assert.deepEqual(outcome.result, contextualAnswer);
});

test('empty and malformed inputs return a safe fallback', async () => {
  const cases = [
    ['', knowledge, {}, optionsFor(paperAnswer)],
    [null, knowledge, {}, optionsFor(paperAnswer)],
    ['question', null, null, null],
    ['question', knowledge, {}, { resolveQuestion: () => null }],
    ['question', knowledge, {}, { resolveQuestion: () => 'answer' }]
  ];

  for (const [question, suppliedKnowledge, context, options] of cases) {
    const outcome = await orchestrateGuideQuestion(
      question,
      suppliedKnowledge,
      context,
      options
    );
    assert.equal(outcome.result.type, 'fallback');
  }
});

test('oversized questions are rejected before resolution or model generation', async () => {
  let resolverCalls = 0;
  let modelCalls = 0;
  const outcome = await orchestrateGuideQuestion(
    'q'.repeat(301),
    knowledge,
    {},
    {
      resolveQuestion: () => {
        resolverCalls += 1;
        return paperAnswer;
      },
      generateResponse: () => {
        modelCalls += 1;
        return modelAnswer;
      }
    }
  );

  assert.equal(resolverCalls, 0);
  assert.equal(modelCalls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('oversized whitelisted context is rejected before resolution', async () => {
  let resolverCalls = 0;
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    { lastTopicId: 't'.repeat(129) },
    {
      resolveQuestion: () => {
        resolverCalls += 1;
        return paperAnswer;
      }
    }
  );

  assert.equal(resolverCalls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('malformed context access fails closed before resolution', async () => {
  let resolverCalls = 0;
  const malformedContext = new Proxy({}, {
    get() {
      throw new Error('Synthetic malformed context');
    }
  });
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    malformedContext,
    {
      resolveQuestion: () => {
        resolverCalls += 1;
        return paperAnswer;
      }
    }
  );

  assert.equal(resolverCalls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('input knowledge and context objects are never mutated', async () => {
  const mutableKnowledge = structuredClone(knowledge);
  const context = {
    lastTopicId: 'paper-robotics',
    lastDestinationNpcId: null,
    lastDestinationZoneId: null
  };
  const knowledgeSnapshot = JSON.stringify(mutableKnowledge);
  const contextSnapshot = JSON.stringify(context);

  await orchestrateGuideQuestion(
    'Explain paper robotics.',
    mutableKnowledge,
    context,
    optionsFor(paperAnswer)
  );

  assert.equal(JSON.stringify(mutableKnowledge), knowledgeSnapshot);
  assert.equal(JSON.stringify(context), contextSnapshot);
});

test('repeatable model responses produce deterministic outcomes', async () => {
  const first = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer)
  );
  const second = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer)
  );

  assert.deepEqual(first, second);
});

test('missing model callbacks use the deterministic supported result', async () => {
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    { resolveQuestion: resolverReturning(paperAnswer) }
  );

  assert.deepEqual(outcome.result, paperAnswer);
});

test('resolver failures return a safe fallback without calling the model', async () => {
  let modelCalls = 0;
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    {
      resolveQuestion: () => { throw new Error('Synthetic resolver error'); },
      generateResponse: () => { modelCalls += 1; }
    }
  );

  assert.equal(modelCalls, 0);
  assert.equal(outcome.result.type, 'fallback');
});

test('model request construction rejects topics without approved facts', () => {
  const topic = {
    id: 'empty-topic',
    status: 'verified',
    facts: [{ id: 'draft-fact', status: 'candidate', text: 'Not approved.' }]
  };

  assert.equal(createModelRequest('question', topic, {}), null);
});

test('model request construction rejects duplicate fact IDs at any approval status', () => {
  const topic = {
    ...knowledge.topics[0],
    facts: [
      ...knowledge.topics[0].facts,
      {
        id: 'paper-folds',
        status: 'candidate',
        text: 'A conflicting draft fact.'
      }
    ]
  };

  assert.equal(createModelRequest('question', topic, {}), null);
});

test('model response validation rejects duplicate fact declarations', () => {
  const validation = validateModelResponse(
    { ...modelAnswer, usedFactIds: ['paper-folds', 'paper-folds'] },
    'paper-robotics',
    ['paper-folds']
  );

  assert.equal(validation.valid, false);
});

test('model response validation rejects duplicate allowed fact IDs', () => {
  const validation = validateModelResponse(
    { ...modelAnswer, usedFactIds: ['paper-folds'] },
    'paper-robotics',
    ['paper-folds', 'paper-folds']
  );

  assert.equal(validation.valid, false);
});

test('hostile malformed model output fails validation without throwing', async () => {
  const malformedOutput = new Proxy({}, {
    ownKeys() {
      throw new Error('Synthetic malformed output');
    }
  });
  const validation = validateModelResponse(
    malformedOutput,
    'paper-robotics',
    ['paper-folds']
  );
  const outcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    knowledge,
    {},
    optionsFor(paperAnswer, () => malformedOutput)
  );

  assert.equal(validation.valid, false);
  assert.deepEqual(outcome.result, paperAnswer);
});

test('malformed knowledge records fail closed without model generation', async () => {
  let calls = 0;
  const malformedRecord = new Proxy({}, {
    get() {
      throw new Error('Synthetic malformed record');
    }
  });
  const malformedTopicKnowledge = {
    ...knowledge,
    topics: [malformedRecord, ...knowledge.topics]
  };
  const malformedSpecialistKnowledge = {
    ...knowledge,
    specialists: [malformedRecord, ...knowledge.specialists]
  };

  const topicOutcome = await orchestrateGuideQuestion(
    'Explain paper robotics.',
    malformedTopicKnowledge,
    {},
    optionsFor(paperAnswer, () => { calls += 1; })
  );
  const routeOutcome = await orchestrateGuideQuestion(
    'Who teaches paper robotics?',
    malformedSpecialistKnowledge,
    {},
    optionsFor(paperRoute, () => { calls += 1; })
  );

  assert.equal(calls, 0);
  assert.equal(topicOutcome.result.type, 'fallback');
  assert.equal(routeOutcome.result.type, 'fallback');
});

test('simulated model callbacks make no network requests', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error('Network access is forbidden in this test.');
  };

  try {
    await orchestrateGuideQuestion(
      'Explain paper robotics.',
      knowledge,
      {},
      optionsFor(paperAnswer)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 0);
});

// All content/approval flags below are synthetic; they do not approve CORE facts.
const matcherAdapter = (question, suppliedKnowledge, _state, options) => (
  matchQuestion(question, suppliedKnowledge.topics, options)
);

test('actual Stage 2 matcher adapter supports answers, routes and model failures', async () => {
  for (const [question, type] of [['paper robotics', 'answer'], ['paper specialist', 'route']]) {
    const outcome = await orchestrateGuideQuestion(question, knowledge, {}, {
      resolveQuestion: matcherAdapter,
      generateResponse: () => { throw new Error('Synthetic provider failure'); }
    });
    assert.equal(outcome.result.type, type);
    assert.equal(outcome.result.response, type === 'answer' ? paperAnswer.response : paperRoute.response);
    if (type === 'route') assert.equal(outcome.result.destinationZoneId, 'printing-room');
  }
});

test('actual matcher and memory preserve routes, follow-ups, unknown questions and reset', async () => {
  const suppliedKnowledge = structuredClone(knowledge);
  suppliedKnowledge.specialists[0].expertise = 'Synthetic paper expertise.';
  let calls = 0;
  const options = {
    resolveQuestion: handleGuideQuestion,
    resolverOptions: { matchQuestion },
    generateResponse: (request) => {
      calls += 1;
      return { ...modelAnswer, topicId: request.topicId };
    }
  };
  const routed = await orchestrateGuideQuestion('paper specialist', suppliedKnowledge,
    createConversationState(), options);
  assert.equal(routed.result.type, 'route');
  assert.equal(routed.result.destinationNpcId, paperRoute.destinationNpcId);
  assert.equal(routed.state.lastTopicId, paperRoute.topicId);
  for (const [question, response] of [
    ['Where can I find them?', suppliedKnowledge.specialists[0].directions],
    ['What do they specialize in?', suppliedKnowledge.specialists[0].expertise]
  ]) {
    const followUp = await orchestrateGuideQuestion(question, suppliedKnowledge, routed.state, options);
    assert.equal(followUp.result.response, response);
    assert.deepEqual(followUp.state, routed.state);
  }
  const unknown = await orchestrateGuideQuestion('unrelated weather', suppliedKnowledge, routed.state, options);
  assert.equal(unknown.result.type, 'fallback');
  assert.deepEqual(unknown.state, routed.state);
  const reset = await orchestrateGuideQuestion('Where can I find them?', suppliedKnowledge,
    clearConversationState(), options);
  assert.equal(reset.result.type, 'clarify');
  assert.equal(calls, 1);
});

test('actual memory clears revoked specialist context before orchestrating follow-ups', async () => {
  const options = { resolveQuestion: handleGuideQuestion, resolverOptions: { matchQuestion } };
  const routed = await orchestrateGuideQuestion('paper specialist', knowledge, createConversationState(), options);
  const revoked = structuredClone(knowledge);
  revoked.specialists[0].status = 'candidate';
  const outcome = await orchestrateGuideQuestion('Where can I find them?', revoked, routed.state, options);
  assert.equal(outcome.result.type, 'clarify');
  assert.deepEqual(outcome.state, createConversationState());
});

test('Stage 2 routes reject approved destinations outside the three-zone scope', async () => {
  for (const id of ['machine-shop', 'computer-lab', 'another-room']) {
    const suppliedKnowledge = structuredClone(knowledge);
    suppliedKnowledge.topics[1].destinationZoneId = id;
    suppliedKnowledge.specialists[0].zoneId = id;
    suppliedKnowledge.zones[0].id = id;
    let calls = 0;
    const outcome = await orchestrateGuideQuestion('paper specialist', suppliedKnowledge, {}, {
      resolveQuestion: matcherAdapter,
      generateResponse: () => { calls += 1; return modelAnswer; }
    });
    assert.equal(outcome.result.type, 'fallback');
    assert.equal(calls, 0);
  }
});

test('injected resolver cannot replace verified prose, topic type or canonical destination', async () => {
  const suppliedKnowledge = structuredClone(knowledge);
  suppliedKnowledge.specialists.push({ ...suppliedKnowledge.specialists[0], id: 'another-specialist' });
  for (const result of [
    { ...paperAnswer, response: 'Invented answer.' },
    { ...paperRoute, response: 'Invented route.' },
    { ...paperAnswer, topicId: paperRoute.topicId },
    { ...paperRoute, destinationNpcId: 'another-specialist' },
    { ...paperAnswer, destinationNpcId: paperRoute.destinationNpcId, destinationZoneId: 'printing-room' },
    { ...paperRoute, type: 'answer', response: 'Invented follow-up.' }
  ]) {
    let calls = 0;
    const outcome = await orchestrateGuideQuestion('question', suppliedKnowledge, {},
      optionsFor(result, () => { calls += 1; return modelAnswer; }));
    assert.equal(outcome.result.type, 'fallback');
    assert.equal(calls, 0);
  }
});

test('whitespace aliases cannot hide duplicate topic, zone or specialist records', async () => {
  for (const [collection, original] of [
    ['topics', knowledge.topics[1]], ['zones', knowledge.zones[0]],
    ['specialists', knowledge.specialists[0]]
  ]) {
    const suppliedKnowledge = structuredClone(knowledge);
    suppliedKnowledge[collection].push({ ...original, id: ` ${original.id} `, status: 'candidate' });
    const outcome = await orchestrateGuideQuestion('question', suppliedKnowledge, {}, optionsFor(paperRoute));
    assert.equal(outcome.result.type, 'fallback');
  }
});

test('malformed resolver scores and destination fields fail closed', async () => {
  for (const result of [
    { ...paperAnswer, score: -1 }, { ...paperAnswer, score: NaN },
    { ...paperAnswer, score: undefined }, { ...paperAnswer, destinationNpcId: 7 },
    { ...deterministicFallback, topicId: paperAnswer.topicId },
    { ...deterministicClarification, destinationZoneId: 'hallway' }
  ]) {
    const outcome = await orchestrateGuideQuestion('question', knowledge, {}, optionsFor(result));
    assert.equal(outcome.result.type, 'fallback');
    assert.equal(outcome.result.response, "I don't have a verified answer for that question.");
  }
});

test('deterministic answers and specialist follow-ups do not depend on model facts', async () => {
  const suppliedKnowledge = structuredClone(knowledge);
  for (const topic of suppliedKnowledge.topics) delete topic.facts;
  let calls = 0;
  const options = {
    resolveQuestion: handleGuideQuestion, resolverOptions: { matchQuestion },
    generateResponse: () => { calls += 1; return modelAnswer; }
  };
  const answer = await orchestrateGuideQuestion('paper robotics', suppliedKnowledge, {}, options);
  assert.equal(answer.result.response, paperAnswer.response);
  const routed = await orchestrateGuideQuestion('paper specialist', suppliedKnowledge, {}, options);
  assert.equal(routed.result.type, 'route');
  const followUp = await orchestrateGuideQuestion('Where can I find them?', suppliedKnowledge, routed.state, options);
  assert.equal(followUp.result.response, suppliedKnowledge.specialists[0].directions);
  assert.equal(calls, 0);
});

test('actual memory route without directions remains available without inventing directions', async () => {
  const suppliedKnowledge = structuredClone(knowledge);
  delete suppliedKnowledge.specialists[0].directions;
  const options = { resolveQuestion: handleGuideQuestion, resolverOptions: { matchQuestion } };
  const routed = await orchestrateGuideQuestion('paper specialist', suppliedKnowledge, {}, options);
  assert.equal(routed.result.type, 'route');
  assert.equal(routed.result.directions, null);
  const followUp = await orchestrateGuideQuestion('Where can I find them?', suppliedKnowledge, routed.state, options);
  assert.equal(followUp.result.type, 'fallback');
  assert.equal(followUp.result.response, "I don't have verified directions for that specialist.");
});

test('late model completion cannot change the returned timeout fallback', async () => {
  let finish;
  const outcome = await orchestrateGuideQuestion('paper robotics', knowledge, {}, optionsFor(paperAnswer,
    () => new Promise((resolve) => { finish = resolve; }), { modelTimeoutMs: 5 }));
  assert.deepEqual(outcome.result, paperAnswer);
  finish(modelAnswer);
  await Promise.resolve();
  assert.deepEqual(outcome.result, paperAnswer);
});
