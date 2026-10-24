import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGuidePreviewSession,
  generateSimulatedResponse
} from '../src/guide-preview-adapter.js';
import { PREVIEW_KNOWLEDGE } from '../src/guide-preview-knowledge.js';

test('general question returns a validated simulated response', async () => {
  const session = createGuidePreviewSession();
  const outcome = await session.ask('What is paper robotics?');

  assert.equal(outcome.result.type, 'answer');
  assert.equal(outcome.result.topicId, 'paper-robotics-overview');
  assert.match(outcome.result.response, /^Simulated guide response:/);
});

test('specialist question returns canonical NPC and destination data', async () => {
  const session = createGuidePreviewSession();
  const outcome = await session.ask('Who can teach me paper robotics?');

  assert.equal(outcome.result.type, 'route');
  assert.equal(outcome.result.destinationNpcId, 'npc-paper-specialist');
  assert.equal(outcome.result.destinationZoneId, 'zone-paper-workshop');
  assert.equal(
    outcome.result.directions,
    'Walk to the fictional paper workshop beside the blue model display.'
  );
});

test('destination follow-up uses remembered specialist context', async () => {
  const session = createGuidePreviewSession();
  await session.ask('Who can teach me paper robotics?');
  const outcome = await session.ask('Where can I find them?');

  assert.equal(outcome.result.type, 'answer');
  assert.equal(
    outcome.result.response,
    'Walk to the fictional paper workshop beside the blue model display.'
  );
  assert.equal(outcome.result.destinationNpcId, 'npc-paper-specialist');
});

test('expertise follow-up uses approved specialist information', async () => {
  const session = createGuidePreviewSession();
  await session.ask('Who can teach me paper robotics?');
  const outcome = await session.ask('What do they specialize in?');

  assert.equal(
    outcome.result.response,
    'Parker specializes in fictional folded mechanisms and paper motion demonstrations.'
  );
});

test('new specialist topic replaces the previous conversation context', async () => {
  const session = createGuidePreviewSession();
  await session.ask('Who can teach me paper robotics?');
  await session.ask('Who teaches glass-engine design?');
  const outcome = await session.ask('Where can I find them?');

  assert.equal(outcome.result.destinationNpcId, 'npc-glass-specialist');
  assert.equal(outcome.result.destinationZoneId, 'zone-glass-lab');
  assert.equal(
    outcome.result.response,
    'Walk to the fictional glass lab beside the amber model cabinet.'
  );
});

test('unsupported questions bypass the simulated model and return fallback', async () => {
  let modelCalls = 0;
  const session = createGuidePreviewSession({
    generateResponse: () => {
      modelCalls += 1;
      return null;
    }
  });
  const outcome = await session.ask('What is the weather tomorrow?');

  assert.equal(modelCalls, 0);
  assert.equal(outcome.result.type, 'fallback');
  assert.match(outcome.result.response, /verified answer/);
});

test('ambiguous questions bypass the simulated model and request clarification', async () => {
  let modelCalls = 0;
  const session = createGuidePreviewSession({
    generateResponse: () => {
      modelCalls += 1;
      return null;
    }
  });
  const outcome = await session.ask('Tell me about fictional design.');

  assert.equal(modelCalls, 0);
  assert.equal(outcome.result.type, 'clarify');
});

test('simulated model failure returns the deterministic response', async () => {
  const session = createGuidePreviewSession({
    generateResponse: () => Promise.reject(new Error('Synthetic preview failure'))
  });
  const outcome = await session.ask('What is paper robotics?');

  assert.equal(outcome.result.type, 'answer');
  assert.equal(
    outcome.result.response,
    'Paper robotics is a fictional field that uses folded materials to demonstrate motion.'
  );
});

test('model output cannot replace canonical directions', async () => {
  const session = createGuidePreviewSession({
    generateResponse: (request) => ({
      ...generateSimulatedResponse(request),
      directions: 'Go to an invented hidden room.'
    })
  });
  const outcome = await session.ask('Who can teach me paper robotics?');

  assert.equal(outcome.result.response, 'I recommend the fictional paper-robotics specialist.');
  assert.equal(
    outcome.result.directions,
    'Walk to the fictional paper workshop beside the blue model display.'
  );
});

test('reset clears prior specialist context', async () => {
  const session = createGuidePreviewSession();
  await session.ask('Who can teach me paper robotics?');
  session.reset();
  const outcome = await session.ask('Where can I find them?');

  assert.equal(outcome.result.type, 'clarify');
  assert.deepEqual(session.getState(), {
    lastTopicId: null,
    lastDestinationNpcId: null,
    lastDestinationZoneId: null
  });
});

test('simulated preview does not call fetch or persist transcript data', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error('Network access is forbidden in the local preview.');
  };

  try {
    const session = createGuidePreviewSession({ knowledge: PREVIEW_KNOWLEDGE });
    await session.ask('What is paper robotics?');
    assert.deepEqual(Object.keys(session.getState()).sort(), [
      'lastDestinationNpcId',
      'lastDestinationZoneId',
      'lastTopicId'
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 0);
});
