import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchQuestion } from '../src/guide-qa.js';
import {
  clearConversationState, createConversationState, handleGuideQuestion
} from '../src/guide-conversation.js';

const config = JSON.parse(readFileSync(new URL('../public/zones.json', import.meta.url), 'utf8'));

// These approval flags and sentences are synthetic test fixtures, not CORE facts.
function fixture() {
  return {
    topics: [
      { id: 'test-answer', status: 'verified', type: 'answer',
        phrases: ['synthetic answer'], keywords: ['shared'], response: 'Synthetic verified answer.' },
      { id: 'test-route', status: 'verified', type: 'route',
        phrases: ['synthetic route'], keywords: ['shared'], response: 'Synthetic specialist route.',
        destinationNpcId: 'johnny-bambu', destinationZoneId: 'printing-room' }
    ],
    zones: config.zones.map(({ id }) => ({ id, status: 'approved' })),
    specialists: [{ id: 'johnny-bambu', status: 'approved', zoneId: 'printing-room',
      topicIds: ['test-route'], directions: 'Synthetic directions.', expertise: 'Synthetic expertise.' }]
  };
}

function ask(question, knowledge = fixture(), state = createConversationState(), options = {}) {
  return handleGuideQuestion(question, knowledge, state, { matchQuestion, ...options });
}

test('real matcher returns a verified answer and stores only its topic ID', () => {
  const handled = ask('synthetic answer');
  assert.equal(handled.result.type, 'answer');
  assert.equal(handled.result.response, 'Synthetic verified answer.');
  assert.deepEqual(handled.state, {
    lastTopicId: 'test-answer', lastDestinationNpcId: null, lastDestinationZoneId: null
  });
});

test('real matcher routes to an approved specialist in the configured three-zone tour', () => {
  assert.deepEqual(config.zones.map(({ id }) => id).sort(), ['hallway', 'printing-room', 'project-studio']);
  const handled = ask('synthetic route');
  assert.equal(handled.result.type, 'route');
  const zone = config.zones.find(({ id }) => id === handled.result.destinationZoneId);
  assert.ok(zone.npcs.some(({ id }) => id === handled.result.destinationNpcId));
  assert.equal(handled.state.lastDestinationNpcId, 'johnny-bambu');
});

test('actual ambiguity and unknown questions preserve previously validated context', () => {
  const active = ask('synthetic route').state;
  const ambiguous = ask('shared', fixture(), active, { matcherOptions: { minimumScore: 1 } });
  assert.equal(ambiguous.result.type, 'clarify');
  assert.deepEqual(ambiguous.state, active);
  const unknown = ask('unrelated weather', fixture(), active);
  assert.equal(unknown.result.type, 'fallback');
  assert.deepEqual(unknown.state, active);
});

test('real matcher route supports directions, expertise and explicit reset', () => {
  const first = ask('synthetic route');
  assert.equal(ask('Where can I find them?', fixture(), first.state).result.response, 'Synthetic directions.');
  assert.equal(ask('What do they specialize in?', fixture(), first.state).result.response, 'Synthetic expertise.');
  const cleared = clearConversationState();
  assert.equal(ask('Where can I find them?', fixture(), cleared).result.type, 'clarify');
  assert.equal(first.state.lastTopicId, 'test-route');
  assert.ok(Object.isFrozen(first.state));
});

test('real direct answer removes prior specialist context', () => {
  const active = ask('synthetic route').state;
  const answer = ask('synthetic answer', fixture(), active);
  assert.equal(answer.state.lastDestinationNpcId, null);
  assert.equal(ask('Where can I find them?', fixture(), answer.state).result.type, 'clarify');
});

test('empty and non-string input cannot be promoted by a permissive injected matcher', () => {
  const valid = matchQuestion('synthetic route', fixture().topics);
  for (const question of ['', '   ', '?!', null, undefined, 7, {}, []]) {
    const handled = ask(question, fixture(), undefined, { matchQuestion: () => valid });
    assert.equal(handled.result.type, 'fallback');
    assert.deepEqual(handled.state, createConversationState());
  }
});

test('malformed matcher types, scores and required fields fail safely', () => {
  const answer = matchQuestion('synthetic answer', fixture().topics);
  const invalid = [null, [], 'answer', {}, { ...answer, type: 'generated' },
    { ...answer, topicId: null }, { ...answer, response: '' }, { ...answer, score: undefined },
    { ...answer, score: NaN }, { ...answer, score: Infinity }, { ...answer, score: -1 },
    { ...answer, destinationNpcId: 'johnny-bambu' },
    { type: 'clarify', topicId: 'test-answer', response: 'Invalid', score: 0 },
    { type: 'fallback', topicId: null, response: 'Invalid', score: 0, destinationZoneId: 'hallway' }];
  for (const output of invalid) {
    const handled = ask('question', fixture(), undefined, { matchQuestion: () => output });
    assert.equal(handled.result.type, 'fallback');
    assert.deepEqual(handled.state, createConversationState());
    assert.notEqual(handled.result.response, 'Invalid');
  }
});

test('forged topic IDs, types and answer prose cannot bypass verified knowledge', () => {
  const answer = matchQuestion('synthetic answer', fixture().topics);
  for (const output of [{ ...answer, topicId: 'missing' },
    { ...answer, topicId: 'test-route' }, { ...answer, response: 'Invented answer.' }]) {
    assert.equal(ask('question', fixture(), undefined, { matchQuestion: () => output }).result.type, 'fallback');
  }
});

test('candidate or missing topics are rejected with the real matcher and a forged matcher', () => {
  for (const status of ['candidate', 'rejected', undefined]) {
    const knowledge = fixture();
    const original = matchQuestion('synthetic answer', knowledge.topics);
    knowledge.topics[0].status = status;
    assert.equal(ask('synthetic answer', knowledge).result.type, 'fallback');
    assert.equal(ask('question', knowledge, undefined, { matchQuestion: () => original }).result.type, 'fallback');
  }
});

test('duplicate topic IDs, including whitespace aliases, cannot choose arbitrary knowledge', () => {
  for (const id of ['test-answer', ' test-answer ']) {
    const knowledge = fixture();
    knowledge.topics.push({ ...knowledge.topics[0], id, phrases: [], keywords: [], status: 'candidate' });
    assert.equal(ask('synthetic answer', knowledge).result.type, 'fallback');
  }
});

test('routes reject malformed, missing and mismatched NPC or zone references', () => {
  const route = matchQuestion('synthetic route', fixture().topics);
  for (const change of [{ destinationNpcId: 'NPC INVALID' }, { destinationNpcId: 'missing-npc' },
    { destinationNpcId: null }, { destinationZoneId: 'missing-zone' },
    { destinationZoneId: 'hallway' }, { destinationNpcId: 'hallway-guide' }]) {
    const handled = ask('question', fixture(), undefined, { matchQuestion: () => ({ ...route, ...change }) });
    assert.equal(handled.result.type, 'fallback');
    assert.deepEqual(handled.state, createConversationState());
  }
});

test('out-of-scope destinations are rejected even when marked approved', () => {
  for (const id of ['machine-shop', 'computer-lab', 'another-room']) {
    const knowledge = fixture();
    knowledge.zones.push({ id, status: 'approved' });
    knowledge.topics[1].destinationZoneId = id;
    knowledge.specialists[0].zoneId = id;
    assert.equal(ask('synthetic route', knowledge).result.type, 'fallback');
  }
});

test('unapproved, duplicate or topic-unassociated specialists are not route destinations', () => {
  for (const change of ['unapproved', 'duplicate', 'unassociated', 'wrong-zone']) {
    const knowledge = fixture();
    if (change === 'unapproved') knowledge.specialists[0].status = 'candidate';
    if (change === 'duplicate') knowledge.specialists.push({ ...knowledge.specialists[0] });
    if (change === 'unassociated') knowledge.specialists[0].topicIds = ['test-answer'];
    if (change === 'wrong-zone') knowledge.specialists[0].zoneId = 'hallway';
    assert.equal(ask('synthetic route', knowledge).result.type, 'fallback');
  }
});

test('unapproved and duplicate zones are not route destinations', () => {
  for (const change of ['unapproved', 'duplicate']) {
    const knowledge = fixture();
    const zone = knowledge.zones.find(({ id }) => id === 'printing-room');
    if (change === 'unapproved') zone.status = 'candidate';
    else knowledge.zones.push({ ...zone });
    assert.equal(ask('synthetic route', knowledge).result.type, 'fallback');
  }
});

test('revoked topics or destinations invalidate stale follow-up context', () => {
  const active = ask('synthetic route').state;
  for (const change of ['topic', 'specialist', 'association', 'zone']) {
    const knowledge = fixture();
    if (change === 'topic') knowledge.topics[1].status = 'candidate';
    if (change === 'specialist') knowledge.specialists[0].status = 'candidate';
    if (change === 'association') knowledge.specialists[0].topicIds = [];
    if (change === 'zone') knowledge.zones.find(({ id }) => id === 'printing-room').status = 'candidate';
    const handled = ask('Where can I find them?', knowledge, active);
    assert.equal(handled.result.type, 'clarify');
    assert.deepEqual(handled.state, createConversationState());
  }
});

test('unrelated topic and destination IDs cannot fabricate contextual authority', () => {
  const active = { ...ask('synthetic route').state, lastTopicId: 'test-answer' };
  const handled = ask('Where can I find them?', fixture(), active);
  assert.equal(handled.result.type, 'clarify');
  assert.deepEqual(handled.state, createConversationState());
});

test('invalid knowledge containers and matcher exceptions safely fall back', () => {
  for (const knowledge of [null, [], {}, { topics: 'invalid' }]) {
    assert.equal(ask('synthetic answer', knowledge).result.type, 'fallback');
  }
  assert.equal(ask('question', fixture(), undefined, {
    matchQuestion: () => { throw new Error('synthetic failure'); }
  }).result.type, 'fallback');
});

test('memory never retains visitor transcripts or mutates fixture knowledge', () => {
  const knowledge = fixture();
  const snapshot = JSON.stringify(knowledge);
  const handled = ask('synthetic route', knowledge, { history: ['private question'] });
  assert.equal(JSON.stringify(knowledge), snapshot);
  assert.deepEqual(Object.keys(handled.state), ['lastTopicId', 'lastDestinationNpcId', 'lastDestinationZoneId']);
  assert.equal(JSON.stringify(handled.state).includes('private'), false);
  assert.equal(Object.isFrozen(handled.result), true);
});
