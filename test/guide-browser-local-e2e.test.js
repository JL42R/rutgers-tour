import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { createLocalGuideServer, LOCAL_TOUR_ORIGIN, LOCAL_GUIDE_ADVANCE_PATH } from '../dev/guide-local-server.js';
import { createLocalGuideSession, LOCAL_GUIDE_ENDPOINT } from '../src/guide-local-api.js';
import { LOCAL_GUIDE_RETRIEVAL_QUALITY_CATALOG } from '../src/guide-local-profiles.js';
import { createHallwayLocalQuestionProvider } from '../src/guide-hallway-local.js';
import { createStaticApprovedKnowledgeLoader } from '../worker/src/approved-knowledge.js';

const finite = { timeout: 5000 };
const originalFetch = globalThis.fetch;
let forbiddenFetches = 0;
globalThis.fetch = () => { forbiddenFetches++; throw new Error('No global/external fetch in E2E tests'); };
after(() => { globalThis.fetch = originalFetch; assert.equal(forbiddenFetches, 0); });

function wire(port, path, init = {}) {
  assert.ok(Number.isInteger(port) && port > 0);
  return new Promise((resolve, reject) => {
    const body = init.body ?? '';
    const req = request({ hostname: '127.0.0.1', port, path, method: init.method ?? 'POST', agent: false,
      signal: init.signal, headers: { ...init.headers, Origin: LOCAL_TOUR_ORIGIN, 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c)); res.on('error', reject);
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
    });
    req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('Loopback test deadline')));
    req.end(body);
  });
}
function browserFetch(port) {
  return (url, init) => {
    assert.equal(url, LOCAL_GUIDE_ENDPOINT, 'Production browser configuration stays fixed');
    assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    // Test transport remaps only the port to the ephemeral loopback listener.
    return wire(port, '/guide', init);
  };
}
async function withServer(options, action) {
  const app = await createLocalGuideServer(options);
  try { const address = await app.start(0); await action(address.port, app); }
  finally { await app.close(); assert.equal(app.server.listening, false); }
}

test('browser HTTP: default session traverses real loopback Worker and fake provider with ID-only follow-ups', finite, async () => {
  const metadata = [];
  await withServer({ onProviderRequest: m => metadata.push(m) }, async port => {
    const session = createLocalGuideSession({ fetchImpl: browserFetch(port) });
    const first = await session.ask('How do folded machines move?');
    assert.equal(first.envelope.outcome, 'answered');
    assert.deepEqual(first.envelope.factReferences, [{ factId: 'fact-folded-machines-motion', sourceId: 'source-folded-machines-handbook' }]);
    assert.equal(first.result.specialistName, 'Fictional Folded Machines Guide');
    assert.equal(first.result.destinationZoneId, 'zone-imaginary-workshop');
    assert.match((await session.ask('Where can I find them?')).response, /rotational motion|silver paper arrows/);
    assert.equal((await session.ask('Tell me about glass gardens.')).result.topicId, 'glass-gardens');
    assert.deepEqual(session.getState().topicIds, ['glass-gardens']);
    assert.doesNotMatch(JSON.stringify(session.getState()), /How do|Tell me|answerText/);
    const count = metadata.length;
    assert.equal((await session.ask('What is the weather tomorrow?')).envelope.outcome, 'unsupported');
    assert.equal((await session.ask('Compare fictional folded machines and fictional glass gardens.')).envelope.outcome, 'clarify');
    assert.equal(metadata.length, count, 'Unsupported/ambiguous requests bypass upstream');
    session.reset(); assert.deepEqual(session.getState().topicIds, []);
  });
  assert.ok(metadata.length >= 3);
  assert.ok(metadata.every(m => m.model === 'local-fixture-model' && m.store === false && m.toolCount === 0));
});

test('browser HTTP: advanced connector preserves canonical facts, topic switching and conflict safety', finite, async () => {
  let calls = 0;
  await withServer({ profile: 'retrieval-quality', onProviderRequest: () => calls++ }, async port => {
    const provider = createHallwayLocalQuestionProvider({
      search: '?guideProfile=retrieval-quality', fetchImpl: browserFetch(port)
    });
    const first = await provider.ask('Could you explain why articulated paper devices rotate after a gentle tug?');
    assert.equal(first.envelope.outcome, 'answered');
    assert.equal(first.envelope.factReferences.length, 2);
    assert.match(first.response, /Layered paper hinges/);
    assert.doesNotMatch(first.response, /Untrusted simulated provider prose/);
    assert.match(first.response, /informational only/);
    assert.match((await provider.ask('Where can I find them?')).response, /silver paper arrows/);
    assert.equal((await provider.ask('Why do crystal plants cast colors across the display?')).result.topicId, 'glass-gardens');
    const before = calls;
    assert.equal((await provider.ask('How do paper light patterns work?')).envelope.outcome, 'clarify');
    assert.equal((await provider.ask('How long does the echo fountain repeat its note?')).envelope.outcome, 'clarify');
    assert.equal((await provider.ask('What is the maximum safe speed of paper automata?')).envelope.outcome, 'unsupported');
    assert.equal(calls, before);
    assert.deepEqual(provider.getState().topicIds, ['glass-gardens']);
  });
});

test('browser HTTP: fixed knowledge transition clears stale IDs and a fresh approved topic recovers', finite, async () => {
  await withServer({ profile: 'retrieval-quality', enableTestControls: true }, async port => {
    const session = createLocalGuideSession({ fetchImpl: browserFetch(port), catalog: LOCAL_GUIDE_RETRIEVAL_QUALITY_CATALOG });
    assert.equal((await session.ask('What helps aerial fabric forms bounce back after strong wind?')).envelope.outcome, 'answered');
    assert.deepEqual(session.getState().topicIds, ['cloud-kites']);
    assert.equal((await wire(port, LOCAL_GUIDE_ADVANCE_PATH)).status, 200);
    const recovery = await session.ask('Where is that?');
    assert.equal(recovery.contextReset, true);
    assert.match(recovery.response, /cleared the previous topic/);
    assert.deepEqual(session.getState().topicIds, []);
    const fresh = await session.ask('Why do crystal plants cast colors across the display?');
    assert.equal(fresh.envelope.outcome, 'answered');
    assert.equal(fresh.envelope.knowledgeVersion, 'fictional-retrieval-quality-2026-10-25.2');
  });
});

test('browser HTTP: reset disconnects an active request and leaves no context', finite, async () => {
  let entered;
  const providerEntered = new Promise(resolve => { entered = resolve; });
  await withServer({ providerDelayMs: 1000, onProviderRequest: () => entered() }, async port => {
    const provider = createHallwayLocalQuestionProvider({ fetchImpl: browserFetch(port) });
    const pending = provider.ask('How do folded machines move?');
    await providerEntered;
    provider.reset();
    assert.equal((await pending).stale, true);
    assert.deepEqual(provider.getState().topicIds, []);
  });
});

test('browser HTTP: unavailable server and closed listening port fail with sanitized errors', finite, async () => {
  await withServer({}, async (port, app) => {
    const session = createLocalGuideSession({ fetchImpl: browserFetch(port) });
    await app.close();
    await assert.rejects(session.ask('How do folded machines move?'), error => {
      assert.match(error.message, /backend is unavailable/);
      assert.equal(error.cause, undefined);
      return true;
    });
  });
});

test('browser HTTP: real fake-provider refusal remains a validated unavailable response', finite, async () => {
  await withServer({ providerMode: 'refusal' }, async port => {
    const provider = createHallwayLocalQuestionProvider({ fetchImpl: browserFetch(port) });
    const outcome = await provider.ask('How do folded machines move?');
    assert.equal(outcome.envelope.outcome, 'unavailable');
    assert.deepEqual(outcome.envelope.factReferences, []);
    assert.equal(outcome.result.destinationZoneId, null);
    assert.doesNotMatch(outcome.response, /Synthetic refusal/);
  });
});

test('browser HTTP: invalid/correlation-tampered server envelopes never become displayed answers', finite, async () => {
  await withServer({}, async port => {
    for (const mode of ['requestId', 'directions']) {
      const session = createLocalGuideSession({ fetchImpl: async (url, init) => {
        const response = await browserFetch(port)(url, init);
        const body = await response.json();
        if (mode === 'requestId') body.requestId = 'wrong-request-id';
        else body.canonicalDirections = 'Invented real-world route';
        return new Response(JSON.stringify(body));
      } });
      await assert.rejects(session.ask('How do folded machines move?'), /invalid response/);
      assert.deepEqual(session.getState().topicIds, []);
    }
  });
});

test('browser HTTP: synthetic visitor metadata cannot authorize fictional production routes', finite, async () => {
  const raw = JSON.parse(readFileSync(new URL('../knowledge/core-guide.fixture.v1.json', import.meta.url)));
  raw.contentClassification = 'production';
  let calls = 0;
  await withServer({ loadKnowledge: createStaticApprovedKnowledgeLoader(raw), onProviderRequest: () => calls++ }, async port => {
    const session = createLocalGuideSession({ fetchImpl: browserFetch(port) });
    const outcome = await session.ask('How do folded machines move?');
    assert.equal(outcome.envelope.outcome, 'unsupported');
    assert.equal(outcome.result.destinationZoneId, null);
    assert.equal(calls, 0);
  });
});
