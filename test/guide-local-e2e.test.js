import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_GUIDE_PORT,
  LOCAL_TOUR_ORIGIN,
  createLocalGuideServer
} from '../dev/guide-local-server.js';
import { createLocalGuideSession } from '../src/guide-local-api.js';
import { createHallwayGuideQuestionProvider } from '../src/guide-hallway-mock.js';

function browserFetch(url, init) {
  return fetch(url, {
    ...init,
    headers: { ...init.headers, Origin: LOCAL_TOUR_ORIGIN }
  });
}

test('real localhost HTTP crosses browser client, Worker, and fake OpenAI adapter', async () => {
  const providerRequests = [];
  const app = await createLocalGuideServer({
    onProviderRequest: (metadata) => providerRequests.push(metadata)
  });
  await app.start(LOCAL_GUIDE_PORT);
  try {
    const session = createLocalGuideSession({ fetchImpl: browserFetch });
    const first = await session.ask('How do folded machines move?');
    const followUp = await session.ask('Where can I find them?');
    const expertise = await session.ask('What do they specialize in?');
    const glass = await session.ask('Tell me about glass gardens.');
    const glassFollowUp = await session.ask('Where can I find that?');
    const unsupported = await session.ask('What is the weather tomorrow?');
    const ambiguous = await session.ask(
      'Compare fictional folded machines and fictional glass gardens.'
    );
    const hallwayProvider = createHallwayGuideQuestionProvider({
      search: '?guideMock=1&guideBackend=local',
      fetchImpl: browserFetch
    });
    const uiOutcome = await hallwayProvider.ask('How do folded machines move?');

    assert.equal(first.envelope.outcome, 'answered');
    assert.equal(
      first.envelope.answerText,
      'In this fictional fixture, folded paper mechanisms demonstrate rotational motion.'
    );
    assert.deepEqual(first.envelope.factReferences, [{
      factId: 'fact-folded-machines-motion',
      sourceId: 'source-folded-machines-handbook'
    }]);
    assert.equal(first.result.specialistNpcId, undefined);
    assert.equal(first.result.destinationNpcId, 'npc-folded-machines-guide');
    assert.equal(first.result.specialistName, 'Fictional Folded Machines Guide');
    assert.equal(first.result.destinationZoneName, 'Fictional Imaginary Workshop');
    assert.equal(followUp.result.directions,
      'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.');
    assert.match(expertise.result.response, /rotational motion/);
    assert.equal(glass.result.topicId, 'glass-gardens');
    assert.equal(glass.result.destinationNpcId, 'npc-glass-gardens-guide');
    assert.equal(glass.result.destinationZoneId, 'zone-prism-conservatory');
    assert.equal(glassFollowUp.result.destinationNpcId, 'npc-glass-gardens-guide');
    assert.match(glassFollowUp.result.directions, /violet glass tiles/);
    assert.deepEqual(session.getState(), {
      topicIds: ['glass-gardens'],
      specialistNpcIds: ['npc-glass-gardens-guide'],
      destinationZoneIds: ['zone-prism-conservatory']
    });
    assert.equal(unsupported.envelope.outcome, 'unsupported');
    assert.equal(ambiguous.envelope.outcome, 'clarify');
    assert.match(uiOutcome.response, /Fictional Folded Machines Guide/);
    assert.match(uiOutcome.response, /Fictional Imaginary Workshop/);
    assert.doesNotMatch(uiOutcome.response, /npc-folded-machines-guide/);
    assert.doesNotMatch(uiOutcome.response, /zone-imaginary-workshop/);
    assert.match(uiOutcome.response, /silver paper arrows/);
    assert.deepEqual(providerRequests, [
      { model: 'local-fixture-model', store: false, toolCount: 0 },
      { model: 'local-fixture-model', store: false, toolCount: 0 },
      { model: 'local-fixture-model', store: false, toolCount: 0 },
      { model: 'local-fixture-model', store: false, toolCount: 0 },
      { model: 'local-fixture-model', store: false, toolCount: 0 },
      { model: 'local-fixture-model', store: false, toolCount: 0 }
    ]);
  } finally {
    await app.close();
  }
  assert.equal(app.server.listening, false);
});

test('local server enforces CORS and turns fake-provider refusal into safe unavailability', async () => {
  const app = await createLocalGuideServer({ providerMode: 'refusal' });
  const address = await app.start(0);
  const endpoint = `http://127.0.0.1:${address.port}/guide`;
  const body = JSON.stringify({
    schemaVersion: '1.1',
    requestId: 'local-refusal-1',
    question: 'How do folded machines move?',
    temporaryContext: { topicIds: [], specialistNpcIds: [], destinationZoneIds: [] }
  });
  try {
    const rejected = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example.test' },
      body
    });
    const refusal = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: LOCAL_TOUR_ORIGIN },
      body
    });
    const refusalBody = await refusal.json();

    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get('access-control-allow-origin'), null);
    assert.equal(refusal.status, 503);
    assert.equal(refusalBody.outcome, 'unavailable');
    assert.equal(refusalBody.error.code, 'provider_unavailable');
    assert.equal(JSON.stringify(refusalBody).includes('Synthetic refusal'), false);
  } finally {
    await app.close();
  }
});
