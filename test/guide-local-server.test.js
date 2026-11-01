import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  createLocalGuideServer, createFakeOpenAIFetch, LOCAL_GUIDE_HOST, LOCAL_GUIDE_PORT,
  LOCAL_TOUR_ORIGIN, LOCAL_GUIDE_ADVANCE_PATH
} from '../dev/guide-local-server.js';
import { createStaticApprovedKnowledgeLoader } from '../worker/src/approved-knowledge.js';
import { OpenAIGuideModelError } from '../worker/src/openai-guide-model.js';
import { validateGuideResponse } from '../src/guide-api-contract.js';
import { prepareApprovedKnowledge } from '../worker/src/approved-knowledge.js';
import { retrievalQualityFixture } from '../test-support/guide-retrieval-quality-fixture.js';

const fixture = () => JSON.parse(readFileSync(new URL('../knowledge/core-guide.fixture.v1.json', import.meta.url)));
const finite = { timeout: 5000 };
const originalFetch = globalThis.fetch;
let externalFetchAttempts = 0;
// All real test HTTP uses node:http below, which rejects non-loopback targets.
globalThis.fetch = () => {
  externalFetchAttempts++;
  throw new Error('External/global fetch is forbidden in localhost bridge tests.');
};
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(externalFetchAttempts, 0, 'No global/provider fetch fallback');
});

function guideBody(overrides = {}) {
  return {
    schemaVersion: '1.1', requestId: 'local-http-test-001',
    question: 'How do folded machines move?',
    temporaryContext: { topicIds: [], specialistNpcIds: [], destinationZoneIds: [] },
    ...overrides
  };
}

function openHttp(base, options = {}) {
  const url = new URL(options.path ?? '/guide', base);
  assert.equal(url.hostname, LOCAL_GUIDE_HOST);
  assert.equal(url.protocol, 'http:');
  const raw = options.rawBody ?? JSON.stringify(options.body ?? guideBody());
  let request;
  const response = new Promise((resolve, reject) => {
    request = httpRequest(url, {
      method: options.method ?? 'POST', agent: false,
      headers: { Origin: LOCAL_TOUR_ORIGIN, 'Content-Type': 'application/json',
        ...(!['GET', 'HEAD', 'OPTIONS'].includes(options.method) ? { 'Content-Length': Buffer.byteLength(raw) } : {}),
        ...options.headers }
    }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('error', reject);
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: incoming.statusCode, headers: incoming.headers, body: text ? JSON.parse(text) : null });
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(2000, () => request.destroy(new Error('Loopback client timeout')));
    request.on('error', reject);
    request.end(['GET', 'HEAD', 'OPTIONS'].includes(options.method) ? undefined : raw);
  });
  return { request, response };
}

const call = (base, options) => openHttp(base, options).response;

async function withServer(options, action) {
  const app = await createLocalGuideServer(options);
  try {
    const address = await app.start(0);
    assert.equal(address.address, LOCAL_GUIDE_HOST);
    assert.equal(address.family, 'IPv4');
    assert.ok(address.port > 0);
    return await action(app, 'http://' + LOCAL_GUIDE_HOST + ':' + address.port, address);
  } finally {
    await app.close();
    assert.equal(app.server.listening, false);
  }
}

function assertCoreAnswer(response, raw = fixture()) {
  const body = response.body;
  assert.equal(response.status, 200);
  assert.equal(body.outcome, 'answered');
  assert.equal(body.topicId, 'folded-machines');
  assert.equal(body.answerText, raw.facts[0].content);
  assert.deepEqual(body.factReferences, [{ factId: raw.facts[0].id, sourceId: raw.facts[0].sourceId }]);
  assert.equal(body.specialistNpcId, 'npc-folded-machines-guide');
  assert.equal(body.destinationZoneId, raw.specialists[0].destinationZoneId);
  assert.equal(body.canonicalDirections, raw.zones.find(z => z.id === body.destinationZoneId).canonicalDirections);
  assert.equal(validateGuideResponse(body, {
    catalog: prepareApprovedKnowledge(raw).catalog, expectedRequestId: 'local-http-test-001'
  }).valid, true);
}

test('localhost bridge: fixed defaults, ephemeral loopback binding and shutdown release the port', finite, async () => {
  assert.equal(LOCAL_GUIDE_HOST, '127.0.0.1');
  assert.equal(LOCAL_GUIDE_PORT, 4188);
  assert.equal(LOCAL_TOUR_ORIGIN, 'http://127.0.0.1:4179');
  let releasedPort;
  await withServer({}, async (app, base, address) => { releasedPort = address.port; });
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(releasedPort, LOCAL_GUIDE_HOST, resolve);
    });
    assert.equal(probe.address().port, releasedPort);
  } finally {
    if (probe.listening) await new Promise((resolve, reject) => probe.close(e => e ? reject(e) : resolve()));
  }
});

test('localhost bridge: successful grounded HTTP traverses Worker and fake Responses adapter', finite, async () => {
  const metadata = [];
  await withServer({ onProviderRequest: m => metadata.push(m) }, async (app, base) => {
    const result = await call(base);
    assertCoreAnswer(result);
    assert.equal(result.headers['access-control-allow-origin'], LOCAL_TOUR_ORIGIN);
    assert.equal(result.headers['cache-control'], 'no-store');
  });
  assert.deepEqual(metadata, [{ model: 'local-fixture-model', store: false, toolCount: 0 }]);
});

test('localhost bridge: provider prose cannot replace canonical text citations or directions', finite, async () => {
  await withServer({ providerAnswerText: 'Invented secret destination and invented directions.' }, async (app, base) => {
    const response = await call(base);
    assertCoreAnswer(response);
    assert.doesNotMatch(JSON.stringify(response.body), /Invented|secret destination/);
  });
});

test('localhost bridge: unsupported questions bypass the fake provider', finite, async () => {
  let calls = 0;
  await withServer({ onProviderRequest: () => calls++ }, async (app, base) => {
    const response = await call(base, { body: guideBody({ question: 'Will it rain tomorrow?' }) });
    assert.equal(response.body.outcome, 'unsupported');
    assert.deepEqual(response.body.factReferences, []);
    assert.equal(response.body.destinationZoneId, null);
  });
  assert.equal(calls, 0);
});

test('localhost bridge: ambiguous approved topics bypass the fake provider', finite, async () => {
  const raw = fixture();
  raw.facts.push({ ...structuredClone(raw.facts[0]), id: 'fact-folded-secondary', topicId: 'folded-secondary' });
  raw.topics.push({ ...structuredClone(raw.topics[0]), id: 'folded-secondary',
    factIds: ['fact-folded-secondary'], specialistIds: [], destinationZoneIds: [] });
  let calls = 0;
  await withServer({ loadKnowledge: createStaticApprovedKnowledgeLoader(raw), onProviderRequest: () => calls++ },
    async (app, base) => {
      const response = await call(base, { body: guideBody({ question: 'Tell me about fictional folded machines.' }) });
      assert.equal(response.body.outcome, 'clarify');
      assert.deepEqual(response.body.factReferences, []);
    });
  assert.equal(calls, 0);
});

test('localhost bridge: conflicting advanced facts bypass the fake provider', finite, async () => {
  let calls = 0;
  await withServer({ profile: 'retrieval-quality', onProviderRequest: () => calls++ }, async (app, base) => {
    const response = await call(base, { body: guideBody({ question: 'How long does the echo fountain repeat its note?' }) });
    assert.equal(response.body.outcome, 'clarify');
    assert.deepEqual(response.body.factReferences, []);
    assert.equal(response.body.canonicalDirections, null);
  });
  assert.equal(calls, 0);
});

test('localhost bridge: allowed CORS preflight never invokes the provider', finite, async () => {
  let calls = 0;
  await withServer({ onProviderRequest: () => calls++ }, async (app, base) => {
    const response = await call(base, { method: 'OPTIONS' });
    assert.equal(response.status, 204);
    assert.equal(response.headers['access-control-allow-origin'], LOCAL_TOUR_ORIGIN);
    assert.equal(response.headers['access-control-allow-methods'], 'POST, OPTIONS');
  });
  assert.equal(calls, 0);
});

test('localhost bridge: foreign and missing browser origins fail before provider invocation', finite, async () => {
  let calls = 0;
  await withServer({ onProviderRequest: () => calls++ }, async (app, base) => {
    for (const Origin of ['https://foreign.example.test', '']) {
      const response = await call(base, { headers: { Origin } });
      assert.equal(response.status, 403);
      assert.equal(response.headers['access-control-allow-origin'], undefined);
    }
  });
  assert.equal(calls, 0);
});

test('localhost bridge: malformed JSON schemas and content types fail safely', finite, async () => {
  let calls = 0;
  await withServer({ onProviderRequest: () => calls++ }, async (app, base) => {
    for (const options of [
      { rawBody: '{broken-private-body' },
      { body: guideBody({ question: '' }) },
      { body: guideBody({ visitorApproval: 'untrusted' }) }
    ]) {
      const response = await call(base, options);
      assert.equal(response.status, 400);
      assert.doesNotMatch(JSON.stringify(response.body), /broken-private-body|untrusted/);
    }
    assert.equal((await call(base, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  });
  assert.equal(calls, 0);
});

test('localhost bridge: Worker rejects bodies over its 4096-byte contract limit', finite, async () => {
  let calls = 0;
  await withServer({ onProviderRequest: () => calls++ }, async (app, base) => {
    const response = await call(base, { rawBody: 'x'.repeat(5000) });
    assert.equal(response.status, 413);
  });
  assert.equal(calls, 0);
});

test('localhost bridge: outer 8192-byte transport cap drops oversized connections safely', finite, async () => {
  let calls = 0;
  await withServer({ onProviderRequest: () => calls++ }, async (app, base) => {
    await assert.rejects(call(base, { rawBody: 'x'.repeat(9000) }), { code: 'ECONNRESET' });
    assertCoreAnswer(await call(base));
  });
  assert.equal(calls, 1, 'Only the subsequent valid request reaches the provider');
});

test('localhost bridge: unsupported methods paths and query selectors never invoke the provider', finite, async () => {
  let calls = 0;
  await withServer({ onProviderRequest: () => calls++ }, async (app, base) => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const response = await call(base, { method });
      assert.equal(response.status, 405);
      assert.equal(response.headers.allow, 'POST, OPTIONS');
    }
    for (const path of ['/other', '/guide?profile=other', '/guide?file=../../private.json']) {
      assert.equal((await call(base, { path })).status, 404);
    }
  });
  assert.equal(calls, 0);
});

test('localhost bridge: fake refusal uses a completed assistant envelope and fails safely', finite, async () => {
  let envelope;
  const fake = createFakeOpenAIFetch({ mode: 'refusal' });
  await withServer({ providerFetch: async (url, init) => {
    const response = await fake(url, init);
    envelope = await response.clone().json();
    return response;
  } }, async (app, base) => {
    const response = await call(base);
    assert.equal(response.status, 503);
    assert.equal(response.body.outcome, 'unavailable');
    assert.equal(response.body.error.code, 'provider_unavailable');
    assert.deepEqual(response.body.factReferences, []);
  });
  assert.equal(envelope.output[0].role, 'assistant');
  assert.equal(envelope.output[0].status, 'completed');
  assert.equal(envelope.output[0].content[0].type, 'refusal');
});

test('localhost bridge: fake provider HTTP failures return safe unavailable responses', finite, async () => {
  let calls = 0;
  await withServer({ providerMode: 'http_error', onProviderRequest: () => calls++ }, async (app, base) => {
    const response = await call(base);
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'provider_unavailable');
    assert.deepEqual(response.body.factReferences, []);
    assert.equal(response.body.canonicalDirections, null);
  });
  assert.equal(calls, 1);
});

test('localhost bridge: adapter timeout aborts the delayed fake transport', finite, async () => {
  let signal;
  const fake = createFakeOpenAIFetch({ delayMs: 1000 });
  await withServer({ providerTimeoutMs: 20, providerFetch: (url, init) => {
    signal = init.signal; return fake(url, init);
  } }, async (app, base) => {
    const response = await call(base);
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'provider_unavailable');
    assert.equal(signal.aborted, true);
  });
});

test('localhost bridge: outer Worker timeout also propagates cancellation', finite, async () => {
  let signal;
  const fake = createFakeOpenAIFetch({ delayMs: 1000 });
  await withServer({ modelTimeoutMs: 20, providerFetch: (url, init) => {
    signal = init.signal; return fake(url, init);
  } }, async (app, base) => {
    const response = await call(base);
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'provider_timeout');
    assert.equal(signal.aborted, true);
  });
});

test('localhost bridge: disconnecting the HTTP client aborts the fake provider', finite, async () => {
  let enter;
  const entered = new Promise(resolve => { enter = resolve; });
  const fake = createFakeOpenAIFetch({ delayMs: 1000 });
  await withServer({ providerFetch: (url, init) => {
    enter(init.signal); return fake(url, init);
  } }, async (app, base) => {
    const pending = openHttp(base);
    pending.response.catch(() => {});
    try {
      const signal = await entered;
      const aborted = new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      pending.request.destroy();
      await assert.rejects(pending.response, { code: 'ECONNRESET' });
      await aborted;
      assert.equal(signal.aborted, true);
    } finally {
      pending.request.destroy();
    }
  });
});

test('localhost bridge: unknown facts and model-owned fields or tools are rejected', finite, async () => {
  for (const mode of ['unknown_fact', 'route', 'tool']) {
    const fake = createFakeOpenAIFetch({ mode: mode === 'unknown_fact' ? mode : 'success' });
    await withServer({ providerFetch: async (url, init) => {
      const response = await fake(url, init);
      if (mode === 'unknown_fact') return response;
      const body = await response.json();
      if (mode === 'tool') body.output.push({ type: 'function_call', name: 'invented_tool' });
      else {
        const result = JSON.parse(body.output[0].content[0].text);
        result.destinationZoneId = 'invented-route';
        result.specialistNpcId = 'invented-specialist';
        body.output[0].content[0].text = JSON.stringify(result);
      }
      return new Response(JSON.stringify(body), { status: 200 });
    } }, async (app, base) => {
      const response = await call(base);
      assert.equal(response.status, 503);
      assert.deepEqual(response.body.factReferences, []);
      assert.equal(response.body.destinationZoneId, null);
    });
  }
});

test('localhost bridge: production classification permits only the three approved zones', finite, async () => {
  for (const zone of ['zone-imaginary-workshop', 'hallway', 'printing-room', 'project-studio']) {
    const raw = JSON.parse(JSON.stringify(fixture()).replaceAll('zone-imaginary-workshop', zone));
    raw.contentClassification = 'production';
    let calls = 0;
    await withServer({ loadKnowledge: createStaticApprovedKnowledgeLoader(raw), onProviderRequest: () => calls++ },
      async (app, base) => {
        const response = await call(base);
        if (zone === 'zone-imaginary-workshop') {
          assert.equal(response.body.outcome, 'unsupported');
          assert.equal(response.body.destinationZoneId, null);
          assert.equal(response.body.specialistNpcId, null);
          assert.equal(response.body.canonicalDirections, null);
          assert.equal(calls, 0);
        } else {
          assertCoreAnswer(response, raw);
          assert.equal(calls, 1);
        }
      });
  }
});

test('localhost bridge: visitor classification and knowledge-loader spoofing are not accepted', finite, async () => {
  let calls = 0;
  await withServer({ onProviderRequest: () => calls++ }, async (app, base) => {
    for (const fields of [
      { contentClassification: 'synthetic_fixture' },
      { profile: 'retrieval-quality' },
      { providerFetch: 'https://foreign.example.test' },
      { knowledgePath: '../../private.json' }
    ]) {
      assert.equal((await call(base, { body: guideBody(fields) })).status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('localhost bridge: externally thrown errors and logs never expose private request/provider data', finite, async () => {
  const logs = [];
  await withServer({
    providerFetch() { throw new OpenAIGuideModelError('private-code', 'private-secret-body-stack'); },
    logger: event => logs.push(event)
  }, async (app, base) => {
    const response = await call(base, { body: guideBody({ question: 'How do folded machines move? private-question' }) });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'provider_unavailable');
    assert.doesNotMatch(JSON.stringify({ response, logs }),
      /private-code|private-secret-body-stack|private-question|local-fixture-key-not-a-secret/);
    assert.ok(logs.length > 0);
  });
});

test('localhost bridge: fixed advanced synthetic profile returns canonical retrieved evidence', finite, async () => {
  let calls = 0;
  const { knowledge } = retrievalQualityFixture();
  await withServer({ profile: 'retrieval-quality', onProviderRequest: () => calls++ }, async (app, base) => {
    const response = await call(base, { body: guideBody({ question: 'How do paper automata turn?' }) });
    assert.equal(response.status, 200);
    assert.equal(response.body.outcome, 'answered');
    assert.equal(response.body.topicId, 'folded-machines');
    assert.ok(response.body.factReferences.length >= 1);
    for (const ref of response.body.factReferences) {
      const fact = knowledge.facts.find(f => f.id === ref.factId);
      assert.ok(fact);
      assert.equal(ref.sourceId, fact.sourceId);
      assert.ok(response.body.answerText.includes(fact.content));
    }
    assert.doesNotMatch(response.body.answerText, /Untrusted simulated provider prose/);
    assert.equal(response.body.destinationZoneId, 'zone-imaginary-workshop');
  });
  assert.equal(calls, 1);
});

test('localhost bridge: knowledge transition endpoint is disabled by default for both profiles', finite, async () => {
  for (const profile of ['default', 'retrieval-quality']) {
    await withServer({ profile }, async (app, base) => {
      assert.equal((await call(base, { path: LOCAL_GUIDE_ADVANCE_PATH })).status, 404);
    });
  }
});

test('localhost bridge: test controls require the fixed advanced controller', finite, async () => {
  await assert.rejects(createLocalGuideServer({ enableTestControls: true }), /retrieval-quality/);
  await assert.rejects(createLocalGuideServer({ profile: 'retrieval-quality', enableTestControls: true,
    loadKnowledge: createStaticApprovedKnowledgeLoader(fixture()) }), /retrieval-quality/);
});

test('localhost bridge: explicitly enabled fixed transition changes only in-memory synthetic snapshot', finite, async () => {
  const original = JSON.stringify(retrievalQualityFixture());
  await withServer({ profile: 'retrieval-quality', enableTestControls: true }, async (app, base) => {
    const before = await call(base, { body: guideBody({ question: 'For windborne kites, how is strain shared among the anchor loops?' }) });
    assert.equal(before.body.outcome, 'answered');
    for (const options of [
      { method: 'GET' }, { headers: { Origin: 'https://foreign.example.test' } },
      { headers: { Origin: '' } }
    ]) assert.equal((await call(base, { path: LOCAL_GUIDE_ADVANCE_PATH, ...options })).status, 403);
    assert.equal((await call(base, { path: LOCAL_GUIDE_ADVANCE_PATH + '?file=../../private.json' })).status, 404);
    const transitioned = await call(base, { path: LOCAL_GUIDE_ADVANCE_PATH, rawBody: '' });
    assert.equal(transitioned.status, 200);
    assert.deepEqual(Object.keys(transitioned.body), ['knowledgeVersion']);
    assert.equal(transitioned.body.knowledgeVersion, 'fictional-retrieval-quality-2026-10-25.2');
    const after = await call(base, { body: guideBody({ question: 'For windborne kites, how is strain shared among the anchor loops?' }) });
    assert.equal(after.body.outcome, 'unsupported');
    assert.deepEqual(after.body.factReferences, []);
    assert.equal(after.body.knowledgeVersion, transitioned.body.knowledgeVersion);
    assert.equal((await call(base, { path: LOCAL_GUIDE_ADVANCE_PATH })).status, 409);
  });
  assert.equal(JSON.stringify(retrievalQualityFixture()), original, 'No shared fixture/approval records edited');
});

test('localhost bridge: profile allowlist rejects arbitrary files and unknown profiles', finite, async () => {
  for (const profile of ['../../private.json', 'production', 'https://foreign.example.test']) {
    await assert.rejects(createLocalGuideServer({ profile }), /allowlisted/);
  }
});

test('localhost bridge: CLI exposes no live provider credential host or arbitrary file options', { timeout: 20000 }, () => {
  const script = fileURLToPath(new URL('../dev/guide-local-server.js', import.meta.url));
  for (const args of [['--api-key', 'placeholder'], ['--provider-url', 'https://foreign.example.test'],
    ['--host', '0.0.0.0'], ['--fetch', 'live'], ['--profile', '../../private.json'], ['--test-controls']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 3000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /listening/);
  }
});
