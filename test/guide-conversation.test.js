import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyFollowUp,
  clearConversationState,
  createConversationState,
  handleGuideQuestion
} from '../src/guide-conversation.js';

const paperRoute = Object.freeze({
  type: 'route',
  topicId: 'paper-robotics',
  response: 'Ask the paper specialist.',
  destinationNpcId: 'npc-paper-specialist',
  destinationZoneId: 'zone-model-workshop',
  score: 6
});

const glassRoute = Object.freeze({
  type: 'route',
  topicId: 'glass-engine-design',
  response: 'Ask the glass specialist.',
  destinationNpcId: 'npc-glass-specialist',
  destinationZoneId: 'zone-glass-lab',
  score: 5
});

const fallback = Object.freeze({
  type: 'fallback',
  topicId: null,
  response: 'That subject is outside the synthetic guide.',
  score: 0
});

const knowledge = Object.freeze({
  topics: Object.freeze([
    Object.freeze({ id: 'paper-robotics', status: 'verified' }),
    Object.freeze({ id: 'glass-engine-design', status: 'verified' })
  ]),
  zones: Object.freeze([
    Object.freeze({ id: 'zone-model-workshop', status: 'approved' }),
    Object.freeze({ id: 'zone-glass-lab', status: 'approved' })
  ]),
  specialists: Object.freeze([
    Object.freeze({
      id: 'npc-paper-specialist',
      zoneId: 'zone-model-workshop',
      status: 'approved',
      directions: 'Visit the paper specialist in the fictional model workshop.',
      expertise: 'The paper specialist teaches fictional paper robotics.'
    }),
    Object.freeze({
      id: 'npc-glass-specialist',
      zoneId: 'zone-glass-lab',
      status: 'approved',
      directions: 'Visit the glass specialist in the fictional glass lab.',
      expertise: 'The glass specialist teaches fictional glass-engine design.'
    })
  ])
});

function matcherFor(entries = {}) {
  return (question) => entries[question] ?? fallback;
}

const standardMatcher = matcherFor({
  'Who teaches paper robotics?': paperRoute,
  'Who teaches glass-engine design?': glassRoute
});

function ask(question, state = createConversationState(), customKnowledge = knowledge, options = {}) {
  return handleGuideQuestion(question, customKnowledge, state, {
    matchQuestion: standardMatcher,
    ...options
  });
}

test('creates an empty immutable conversation state', () => {
  const state = createConversationState();

  assert.deepEqual(state, {
    lastTopicId: null,
    lastDestinationNpcId: null,
    lastDestinationZoneId: null
  });
  assert.equal(Object.isFrozen(state), true);
});

test('recognizes only supported narrow follow-up phrases', () => {
  assert.equal(classifyFollowUp('  Where can I find them?! '), 'destination');
  assert.equal(classifyFollowUp('Where can I find that?'), 'destination');
  assert.equal(classifyFollowUp('What do they specialize in?'), 'expertise');
  assert.equal(classifyFollowUp('What did they say yesterday?'), null);
  assert.equal(classifyFollowUp(null), null);
});

test('stores validated context after a specialist recommendation', () => {
  const { result, state } = ask('Who teaches paper robotics?');

  assert.deepEqual(result, paperRoute);
  assert.deepEqual(state, {
    lastTopicId: 'paper-robotics',
    lastDestinationNpcId: 'npc-paper-specialist',
    lastDestinationZoneId: 'zone-model-workshop'
  });
});

test('answers a destination follow-up from approved context', () => {
  const first = ask('Who teaches paper robotics?');
  const followUp = ask('Where can I find them?', first.state);

  assert.equal(followUp.result.type, 'answer');
  assert.equal(
    followUp.result.response,
    'Visit the paper specialist in the fictional model workshop.'
  );
  assert.deepEqual(followUp.state, first.state);
});

test('answers an expertise follow-up from approved context', () => {
  const first = ask('Who teaches paper robotics?');
  const followUp = ask('What do they specialize in?', first.state);

  assert.equal(followUp.result.type, 'answer');
  assert.equal(
    followUp.result.response,
    'The paper specialist teaches fictional paper robotics.'
  );
});

test('asks for clarification when a follow-up has no context', () => {
  const { result, state } = ask('Where can I find them?');

  assert.equal(result.type, 'clarify');
  assert.match(result.response, /ask about a specialist first/i);
  assert.deepEqual(state, createConversationState());
});

test('supports repeated follow-ups without consuming context', () => {
  const first = ask('Who teaches paper robotics?');
  const directions = ask('Where can I find them?', first.state);
  const expertise = ask('What do they specialize in?', directions.state);
  const directionsAgain = ask('Where is that?', expertise.state);

  assert.equal(directions.result.type, 'answer');
  assert.equal(expertise.result.type, 'answer');
  assert.equal(
    directionsAgain.result.response,
    'Visit the paper specialist in the fictional model workshop.'
  );
  assert.deepEqual(directionsAgain.state, first.state);
});

test('replaces specialist context when a new topic is selected', () => {
  const paper = ask('Who teaches paper robotics?');
  const glass = ask('Who teaches glass-engine design?', paper.state);
  const followUp = ask('Where can I find them?', glass.state);

  assert.equal(glass.state.lastDestinationNpcId, 'npc-glass-specialist');
  assert.equal(glass.state.lastDestinationZoneId, 'zone-glass-lab');
  assert.equal(
    followUp.result.response,
    'Visit the glass specialist in the fictional glass lab.'
  );
});

test('clears all context without changing the prior state', () => {
  const active = ask('Who teaches paper robotics?').state;
  const cleared = clearConversationState();

  assert.deepEqual(cleared, createConversationState());
  assert.equal(active.lastTopicId, 'paper-robotics');
  assert.notEqual(cleared, active);
});

test('rejects a malformed specialist identifier', () => {
  const matchQuestion = matcherFor({
    question: { ...paperRoute, destinationNpcId: 'NPC INVALID' }
  });
  const { result, state } = ask('question', undefined, knowledge, { matchQuestion });

  assert.equal(result.type, 'fallback');
  assert.deepEqual(state, createConversationState());
});

test('rejects a well-formed specialist identifier missing from knowledge', () => {
  const matchQuestion = matcherFor({
    question: { ...paperRoute, destinationNpcId: 'npc-missing-specialist' }
  });
  const { result, state } = ask('question', undefined, knowledge, { matchQuestion });

  assert.equal(result.type, 'fallback');
  assert.deepEqual(state, createConversationState());
});

test('rejects a destination zone that is not approved knowledge', () => {
  const matchQuestion = matcherFor({
    question: { ...paperRoute, destinationZoneId: 'zone-missing' }
  });
  const { result, state } = ask('question', undefined, knowledge, { matchQuestion });

  assert.equal(result.type, 'fallback');
  assert.deepEqual(state, createConversationState());
});

test('rejects destination zones that have not been approved', () => {
  const unapprovedZone = {
    ...knowledge,
    zones: [{
      ...knowledge.zones[0],
      status: 'candidate'
    }]
  };
  const { result, state } = ask('Who teaches paper robotics?', undefined, unapprovedZone);

  assert.equal(result.type, 'fallback');
  assert.deepEqual(state, createConversationState());
});

test('rejects a specialist whose configured zone does not match the route', () => {
  const mismatched = {
    ...knowledge,
    specialists: [{
      ...knowledge.specialists[0],
      zoneId: 'zone-glass-lab'
    }]
  };
  const { result } = ask('Who teaches paper robotics?', undefined, mismatched);

  assert.equal(result.type, 'fallback');
});

test('rejects unapproved specialist data', () => {
  const unapproved = {
    ...knowledge,
    specialists: [{
      ...knowledge.specialists[0],
      status: 'candidate'
    }]
  };
  const { result } = ask('Who teaches paper robotics?', undefined, unapproved);

  assert.equal(result.type, 'fallback');
});

test('returns a safe fallback when approved directions are missing', () => {
  const noDirections = {
    ...knowledge,
    specialists: [{
      ...knowledge.specialists[0],
      directions: ''
    }],
    zones: [knowledge.zones[0]]
  };
  const first = ask('Who teaches paper robotics?', undefined, noDirections);
  const followUp = ask('Where can I find them?', first.state, noDirections);

  assert.equal(followUp.result.type, 'fallback');
  assert.match(followUp.result.response, /don't have verified directions/i);
});

test('returns a safe fallback when approved expertise is missing', () => {
  const noExpertise = {
    ...knowledge,
    specialists: [{
      ...knowledge.specialists[0],
      expertise: null
    }],
    zones: [knowledge.zones[0]]
  };
  const first = ask('Who teaches paper robotics?', undefined, noExpertise);
  const followUp = ask('What do they specialize in?', first.state, noExpertise);

  assert.equal(followUp.result.type, 'fallback');
  assert.match(followUp.result.response, /don't have verified expertise/i);
});

test('passes through a matcher fallback for unsupported questions', () => {
  const { result, state } = ask('What is the weather?');

  assert.deepEqual(result, fallback);
  assert.deepEqual(state, createConversationState());
});

test('returns a safe fallback for an empty question', () => {
  const { result, state } = ask('');

  assert.equal(result.type, 'fallback');
  assert.deepEqual(state, createConversationState());
});

test('returns a safe fallback when no matcher is supplied', () => {
  const { result, state } = handleGuideQuestion(
    'Who teaches paper robotics?',
    knowledge,
    createConversationState(),
    null
  );

  assert.equal(result.type, 'fallback');
  assert.deepEqual(state, createConversationState());
});

test('returns a safe fallback for invalid matcher output', () => {
  const outputs = [null, 'answer', [], { type: 'answer', topicId: 'paper-robotics' }];

  for (const output of outputs) {
    const { result, state } = handleGuideQuestion(
      'question',
      knowledge,
      createConversationState(),
      { matchQuestion: () => output }
    );

    assert.equal(result.type, 'fallback');
    assert.deepEqual(state, createConversationState());
  }
});

test('sanitizes invalid state before handling a contextual follow-up', () => {
  const invalidStates = [null, 'state', [], {
    lastTopicId: 47,
    lastDestinationNpcId: {},
    lastDestinationZoneId: []
  }];

  for (const invalidState of invalidStates) {
    const { result, state } = ask('Where can I find them?', invalidState);

    assert.equal(result.type, 'clarify');
    assert.deepEqual(state, createConversationState());
  }
});

test('passes through an ambiguous matcher result', () => {
  const clarify = {
    type: 'clarify',
    topicId: null,
    response: 'Which fictional design topic do you mean?',
    score: 3
  };
  const matchQuestion = matcherFor({ ambiguous: clarify });
  const { result } = ask('ambiguous', undefined, knowledge, { matchQuestion });

  assert.deepEqual(result, clarify);
});

test('clarification preserves previously validated context', () => {
  const first = ask('Who teaches paper robotics?');
  const clarify = {
    type: 'clarify',
    topicId: null,
    response: 'Which fictional design topic do you mean?',
    score: 3
  };
  const matchQuestion = matcherFor({ ambiguous: clarify });
  const ambiguous = ask('ambiguous', first.state, knowledge, { matchQuestion });
  const followUp = ask('Where can I find them?', ambiguous.state);

  assert.deepEqual(ambiguous.state, first.state);
  assert.equal(
    followUp.result.response,
    'Visit the paper specialist in the fictional model workshop.'
  );
});

test('never mutates caller-supplied state during an update', () => {
  const original = Object.freeze({
    lastTopicId: 'paper-robotics',
    lastDestinationNpcId: 'npc-paper-specialist',
    lastDestinationZoneId: 'zone-model-workshop'
  });
  const snapshot = { ...original };
  const next = ask('Who teaches glass-engine design?', original);

  assert.deepEqual(original, snapshot);
  assert.notEqual(next.state, original);
  assert.equal(Object.isFrozen(next.state), true);
});

test('does not mutate supplied knowledge, matcher results, or matcher options', () => {
  const matcherOptions = Object.freeze({ minimumScore: 4 });
  const matchResult = Object.freeze({ ...paperRoute });
  const matchQuestion = () => matchResult;
  const knowledgeSnapshot = JSON.stringify(knowledge);

  const handled = handleGuideQuestion(
    'Who teaches paper robotics?',
    knowledge,
    createConversationState(),
    { matchQuestion, matcherOptions }
  );

  assert.equal(JSON.stringify(knowledge), knowledgeSnapshot);
  assert.deepEqual(matchResult, paperRoute);
  assert.deepEqual(matcherOptions, { minimumScore: 4 });
  assert.notEqual(handled.result, matchResult);
});

test('produces deterministic results for repeated identical inputs', () => {
  const initial = createConversationState();
  const first = ask('Who teaches paper robotics?', initial);
  const second = ask('Who teaches paper robotics?', initial);

  assert.deepEqual(first, second);
});

test('gives an explicit newly matched topic priority over old context', () => {
  const paper = ask('Who teaches paper robotics?');
  const matchQuestion = matcherFor({
    'Where can I find them?': glassRoute
  });
  const next = ask('Where can I find them?', paper.state, knowledge, { matchQuestion });

  assert.equal(next.result.type, 'route');
  assert.equal(next.state.lastTopicId, 'glass-engine-design');
  assert.equal(next.state.lastDestinationNpcId, 'npc-glass-specialist');
});

test('direct answers replace prior specialist context', () => {
  const paper = ask('Who teaches paper robotics?');
  const directAnswer = {
    type: 'answer',
    topicId: 'model-workshop-navigation',
    response: 'This is synthetic navigation information.',
    score: 4
  };
  const matchQuestion = matcherFor({ question: directAnswer });
  const next = ask('question', paper.state, knowledge, { matchQuestion });

  assert.deepEqual(next.state, {
    lastTopicId: 'model-workshop-navigation',
    lastDestinationNpcId: null,
    lastDestinationZoneId: null
  });
});

test('does not store visitor questions or conversation history in state', () => {
  const question = 'Who teaches paper robotics?';
  const state = ask(question).state;
  const serialized = JSON.stringify(state);

  assert.deepEqual(Object.keys(state), [
    'lastTopicId',
    'lastDestinationNpcId',
    'lastDestinationZoneId'
  ]);
  assert.equal(serialized.includes(question), false);
  assert.equal('questions' in state, false);
  assert.equal('history' in state, false);
});

test('passes topics and matcher options to a Stage 2-compatible matcher', () => {
  let receivedTopics;
  let receivedOptions;
  const matchQuestion = (question, topics, options) => {
    receivedTopics = topics;
    receivedOptions = options;
    return fallback;
  };

  handleGuideQuestion('question', knowledge, createConversationState(), {
    matchQuestion,
    matcherOptions: { minimumScore: 4 }
  });

  assert.equal(receivedTopics, knowledge.topics);
  assert.deepEqual(receivedOptions, { minimumScore: 4 });
});

test('falls back safely when the injected matcher throws', () => {
  const { result } = handleGuideQuestion(
    'question',
    knowledge,
    createConversationState(),
    { matchQuestion: () => { throw new Error('synthetic failure'); } }
  );

  assert.equal(result.type, 'fallback');
  assert.match(result.response, /don't have a verified answer/i);
});
