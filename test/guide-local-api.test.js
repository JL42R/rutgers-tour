import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_GUIDE_CATALOG,
  LOCAL_GUIDE_ENDPOINT,
  createLocalGuideSession
} from '../src/guide-local-api.js';

function envelope(request, overrides = {}) {
  return {
    schemaVersion: '1.1',
    requestId: request.requestId,
    outcome: 'answered',
    answerText: 'Approved fictional answer.',
    factReferences: [{
      factId: 'fact-folded-machines-motion',
      sourceId: 'source-folded-machines-handbook'
    }],
    topicId: 'folded-machines',
    specialistNpcId: 'npc-folded-machines-guide',
    specialistName: 'Fictional Folded Machines Guide',
    destinationZoneId: 'zone-imaginary-workshop',
    destinationZoneName: 'Fictional Imaginary Workshop',
    canonicalDirections:
      'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.',
    knowledgeVersion: 'fictional-2026-10-23.2',
    error: null,
    ...overrides
  };
}

test('local browser client sends a validated envelope and keeps bounded ID-only context', async () => {
  const requests = [];
  const session = createLocalGuideSession({
    fetchImpl: async (url, init) => {
      assert.equal(url, LOCAL_GUIDE_ENDPOINT);
      assert.equal(init.credentials, 'omit');
      assert.equal(init.cache, 'no-store');
      const request = JSON.parse(init.body);
      requests.push(request);
      return new Response(JSON.stringify(envelope(request)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  const first = await session.ask('How do folded machines move?');
  const second = await session.ask('Where can I find them?');

  assert.equal(first.result.type, 'route');
  assert.equal(first.result.destinationNpcId, 'npc-folded-machines-guide');
  assert.equal(first.result.specialistName, 'Fictional Folded Machines Guide');
  assert.equal(first.result.destinationZoneName, 'Fictional Imaginary Workshop');
  assert.deepEqual(requests[0].temporaryContext, {
    topicIds: [], specialistNpcIds: [], destinationZoneIds: []
  });
  assert.deepEqual(requests[1].temporaryContext, {
    topicIds: ['folded-machines'],
    specialistNpcIds: ['npc-folded-machines-guide'],
    destinationZoneIds: ['zone-imaginary-workshop']
  });
  assert.equal(JSON.stringify(session.getState()).includes('How do folded'), false);
  assert.equal(second.stale, false);
});

test('reset aborts a pending request, marks it stale, and clears context', async () => {
  let signal;
  const session = createLocalGuideSession({
    fetchImpl(url, init) {
      signal = init.signal;
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
  });
  const pending = session.ask('How do folded machines move?');
  while (!signal) await new Promise((resolve) => setImmediate(resolve));
  session.reset();

  assert.equal((await pending).stale, true);
  assert.equal(signal.aborted, true);
  assert.deepEqual(session.getState(), {
    topicIds: [], specialistNpcIds: [], destinationZoneIds: []
  });
});

test('client rejects non-loopback configuration and invalid server output', async () => {
  assert.throws(
    () => createLocalGuideSession({ endpoint: 'https://example.test/guide' }),
    /fixed loopback/
  );
  const session = createLocalGuideSession({
    catalog: LOCAL_GUIDE_CATALOG,
    fetchImpl: async () => new Response(JSON.stringify({ unsafe: true }), { status: 200 })
  });
  await assert.rejects(session.ask('A safe fictional question.'), /invalid response/);
});

test('client rejects invalid JSON and a response with the wrong request ID', async () => {
  const invalidJson = createLocalGuideSession({
    fetchImpl: async () => new Response('{not-json', { status: 200 })
  });
  await assert.rejects(invalidJson.ask('A fictional question.'), /invalid JSON/);

  const wrongId = createLocalGuideSession({
    fetchImpl: async (url, init) => {
      const request = JSON.parse(init.body);
      return new Response(JSON.stringify(envelope(request, { requestId: 'wrong-request-id' })));
    }
  });
  await assert.rejects(wrongId.ask('A fictional question.'), /invalid response/);
});

test('a newer question aborts and invalidates the older browser request', async () => {
  let firstSignal;
  let calls = 0;
  const session = createLocalGuideSession({
    fetchImpl(url, init) {
      calls += 1;
      const request = JSON.parse(init.body);
      if (calls === 1) {
        firstSignal = init.signal;
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      return Promise.resolve(new Response(JSON.stringify(envelope(request))));
    }
  });
  const first = session.ask('First fictional question.');
  while (!firstSignal) await new Promise((resolve) => setImmediate(resolve));
  const second = session.ask('How do folded machines move?');

  assert.equal((await first).stale, true);
  assert.equal(firstSignal.aborted, true);
  assert.equal((await second).stale, false);
});

test('an older response arriving after a newer answer stays stale and cannot restore old context', async () => {
  let resolveFirst;
  let calls = 0;
  const session = createLocalGuideSession({
    fetchImpl(url, init) {
      calls += 1;
      const request = JSON.parse(init.body);
      if (calls === 1) {
        return new Promise((resolve) => {
          resolveFirst = () => resolve(new Response(JSON.stringify(envelope(request))));
        });
      }
      return Promise.resolve(new Response(JSON.stringify(envelope(request, {
        topicId: 'glass-gardens',
        factReferences: [{
          factId: 'fact-glass-gardens-light',
          sourceId: 'source-glass-garden-notes'
        }],
        specialistNpcId: 'npc-glass-gardens-guide',
        specialistName: 'Fictional Glass Gardens Guide',
        destinationZoneId: 'zone-prism-conservatory',
        destinationZoneName: 'Fictional Prism Conservatory',
        canonicalDirections:
          'From the fictional guide marker, follow the violet glass tiles to the prism conservatory.'
      }))));
    }
  });
  const first = session.ask('How do folded machines move?');
  while (!resolveFirst) await new Promise((resolve) => setImmediate(resolve));
  const second = await session.ask('Tell me about glass gardens.');
  resolveFirst();

  assert.equal((await first).stale, true);
  assert.equal(second.result.topicId, 'glass-gardens');
  assert.deepEqual(session.getState(), {
    topicIds: ['glass-gardens'],
    specialistNpcIds: ['npc-glass-gardens-guide'],
    destinationZoneIds: ['zone-prism-conservatory']
  });
});

test('browser response validation rejects invented friendly names', async () => {
  const session = createLocalGuideSession({
    fetchImpl: async (url, init) => {
      const request = JSON.parse(init.body);
      return new Response(JSON.stringify(envelope(request, {
        specialistName: 'Invented Browser Specialist'
      })));
    }
  });

  await assert.rejects(session.ask('How do folded machines move?'), /invalid response/);
});

test('network failure becomes a safe local-backend error without storing the question', async () => {
  const session = createLocalGuideSession({
    fetchImpl: async () => { throw new Error('connection refused'); }
  });
  await assert.rejects(
    session.ask('A temporary fictional question.'),
    /backend is unavailable/
  );
  assert.deepEqual(session.getState(), {
    topicIds: [], specialistNpcIds: [], destinationZoneIds: []
  });
});

test('stale approved context is cleared once and a fresh question can recover', async () => {
  const requests = [];
  let call = 0;
  const session = createLocalGuideSession({
    fetchImpl: async (url, init) => {
      call += 1;
      const request = JSON.parse(init.body);
      requests.push(request);
      if (call === 2) {
        return new Response(JSON.stringify({
          schemaVersion: '1.1',
          error: {
            code: 'invalid_request',
            message: 'Request schema is invalid.'
          }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(envelope(request)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  await session.ask('How do folded machines move?');
  const recovery = await session.ask('Where can I find them?');
  const fresh = await session.ask('How do folded machines move?');

  assert.equal(recovery.contextReset, true);
  assert.match(recovery.response, /cleared the previous topic/i);
  assert.equal(fresh.envelope.outcome, 'answered');
  assert.deepEqual(requests[1].temporaryContext.topicIds, ['folded-machines']);
  assert.deepEqual(requests[2].temporaryContext, {
    topicIds: [], specialistNpcIds: [], destinationZoneIds: []
  });
});

test('browser timeout aborts a stalled backend request and reports unavailability', async () => {
  let observedSignal;
  const session = createLocalGuideSession({
    requestTimeoutMs: 5,
    fetchImpl(url, init) {
      observedSignal = init.signal;
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
      });
    }
  });

  await assert.rejects(session.ask('A fictional timeout question.'), /backend is unavailable/);
  assert.equal(observedSignal.aborted, true);
  assert.equal(observedSignal.reason, 'local_backend_timeout');
});
