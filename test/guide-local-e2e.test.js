import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_GUIDE_ADVANCE_PATH,
  LOCAL_GUIDE_PORT,
  LOCAL_GUIDE_RETRIEVAL_PROFILE,
  LOCAL_TOUR_ORIGIN,
  createLocalGuideServer
} from '../dev/guide-local-server.js';
import { createLocalGuideSession } from '../src/guide-local-api.js';
import { LOCAL_GUIDE_RETRIEVAL_QUALITY_CATALOG } from '../src/guide-local-profiles.js';
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

test('allowlisted advanced profile crosses localhost with aliases, grounding, conflict safety, and routing', async () => {
  const providerRequests = [];
  const app = await createLocalGuideServer({
    profile: LOCAL_GUIDE_RETRIEVAL_PROFILE,
    enableTestControls: true,
    onProviderRequest: (metadata) => providerRequests.push(metadata)
  });
  await app.start(LOCAL_GUIDE_PORT);
  try {
    const session = createLocalGuideSession({
      fetchImpl: browserFetch,
      catalog: LOCAL_GUIDE_RETRIEVAL_QUALITY_CATALOG
    });
    const paraphrase = await session.ask(
      'Could you explain why articulated paper devices rotate after a gentle tug?'
    );
    const followUp = await session.ask('Where can I find them?');
    const switched = await session.ask('Why do crystal plants cast colors across the display?');
    const ambiguous = await session.ask('How do paper light patterns work?');
    const conflict = await session.ask('How long does the echo fountain repeat its note?');
    const draft = await session.ask('Do rigid gold rods hold cloud kites in shape?');
    const retired = await session.ask(
      'Does the retired glass garden frame spin as the old guide claimed?'
    );
    const unsupported = await session.ask('What is the weather tomorrow?');

    assert.equal(paraphrase.envelope.outcome, 'answered');
    assert.equal(paraphrase.envelope.knowledgeVersion,
      'fictional-retrieval-quality-2026-10-25.1');
    assert.equal(paraphrase.envelope.answerText,
      'Layered paper hinges convert a gentle pull into rotational motion. ' +
      'A separate fictional demonstration log confirms that linked paper joints turn when the pull tab moves.');
    assert.doesNotMatch(paraphrase.envelope.answerText, /Untrusted simulated provider prose/);
    assert.deepEqual(paraphrase.envelope.factReferences, [
      { factId: 'fact-folded-motion-primary', sourceId: 'source-folded-handbook-v2' },
      { factId: 'fact-folded-motion-confirmation', sourceId: 'source-folded-demonstration-log' }
    ]);
    assert.equal(paraphrase.result.specialistName, 'Fictional Folded Machines Guide');
    assert.equal(paraphrase.result.destinationZoneName, 'Fictional Imaginary Workshop');
    assert.match(followUp.result.directions, /silver paper arrows/);
    assert.equal(switched.result.topicId, 'glass-gardens');
    assert.equal(switched.result.specialistName, 'Fictional Glass Gardens Guide');
    assert.equal(ambiguous.envelope.outcome, 'clarify');
    assert.equal(conflict.envelope.outcome, 'clarify');
    assert.match(conflict.response, /approved sources conflict/i);
    for (const excluded of [draft, retired, unsupported]) {
      assert.equal(excluded.envelope.outcome, 'unsupported');
      assert.deepEqual(excluded.envelope.factReferences, []);
      assert.equal(excluded.result.destinationNpcId, null);
      assert.equal(excluded.result.destinationZoneId, null);
    }
    session.reset();
    const cloud = await session.ask('Why do sky sails recover after a gust?');
    assert.equal(cloud.envelope.outcome, 'answered');
    assert.deepEqual(session.getState().topicIds, ['cloud-kites']);

    const transition = await fetch(
      `http://127.0.0.1:${LOCAL_GUIDE_PORT}${LOCAL_GUIDE_ADVANCE_PATH}`,
      { method: 'POST', headers: { Origin: LOCAL_TOUR_ORIGIN } }
    );
    assert.equal(transition.status, 200);
    assert.deepEqual(await transition.json(), {
      knowledgeVersion: 'fictional-retrieval-quality-2026-10-25.2'
    });

    const recovery = await session.ask('Where is that?');
    assert.equal(recovery.contextReset, true);
    assert.match(recovery.response, /cleared the previous topic/i);
    assert.deepEqual(session.getState(), {
      topicIds: [], specialistNpcIds: [], destinationZoneIds: []
    });

    const fresh = await session.ask('Why do crystal plants cast colors across the display?');
    assert.equal(fresh.envelope.outcome, 'answered');
    assert.equal(fresh.envelope.knowledgeVersion,
      'fictional-retrieval-quality-2026-10-25.2');
    assert.equal(fresh.result.topicId, 'glass-gardens');
    assert.equal(providerRequests.length, 5);
    assert.ok(providerRequests.every((entry) => (
      entry.model === 'local-fixture-model' && entry.store === false && entry.toolCount === 0
    )));
  } finally {
    await app.close();
  }
});

test('local server rejects arbitrary profiles and test controls outside the fixed advanced profile', async () => {
  await assert.rejects(
    createLocalGuideServer({ profile: '../../visitor-file.json' }),
    /not allowlisted/
  );
  await assert.rejects(
    createLocalGuideServer({ enableTestControls: true }),
    /require the retrieval-quality profile/
  );
});
