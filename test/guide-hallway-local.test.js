import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as local from '../src/guide-hallway-local.js';
import { LOCAL_GUIDE_ENDPOINT } from '../src/guide-local-api.js';
import { localGuideCatalogForSearch, LOCAL_GUIDE_RETRIEVAL_QUALITY_CATALOG } from '../src/guide-local-profiles.js';

const flags = '?guideMock=1&guideBackend=local';
function envelope(request) {
  return {
    schemaVersion: '1.1', requestId: request.requestId, outcome: 'answered',
    answerText: 'Approved fictional rotational motion.',
    factReferences: [{ factId: 'fact-folded-machines-motion', sourceId: 'source-folded-machines-handbook' }],
    topicId: 'folded-machines', specialistNpcId: 'npc-folded-machines-guide',
    specialistName: 'Fictional Folded Machines Guide',
    destinationZoneId: 'zone-imaginary-workshop', destinationZoneName: 'Fictional Imaginary Workshop',
    canonicalDirections: 'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.',
    knowledgeVersion: 'fictional-2026-10-23.2', error: null
  };
}

test('local connector: activation requires development and both exact flags', () => {
  for (const search of ['', '?guideMock=1', '?guideBackend=local', '?guideMock=0&guideBackend=local',
    '?guideMock=1&guideBackend=remote']) {
    assert.equal(local.isHallwayLocalEnabled({ isDevelopment: true, search }), false);
  }
  assert.equal(local.isHallwayLocalEnabled({ search: flags }), false);
  assert.equal(local.isHallwayLocalEnabled({ isDevelopment: false, search: flags }), false);
  assert.equal(local.isHallwayLocalEnabled({ isDevelopment: true, search: flags }), true);
});

test('local connector: actual main guard never imports or registers in production/missing-flag modes', async () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('if (import.meta.env.DEV)');
  const end = main.indexOf('let initialWelcomeStarted', start);
  assert.ok(start > 0 && end > start);
  const guard = main.slice(start, end).replace('import.meta.env.DEV', 'IS_DEV')
    .replace("import('./guide-hallway-local.js')", 'loadConnector()');
  for (const [IS_DEV, search, expected] of [[false, flags, 0], [true, '', 0],
    [true, '?guideMock=1', 0], [true, '?guideBackend=local', 0], [true, flags, 1]]) {
    let imports = 0, disclosures = 0;
    const registrations = [];
    vm.runInNewContext(guard, {
      IS_DEV, URLSearchParams, window: { location: { search } }, console: { warn() {} },
      dialogue: { registerQuestionProvider: (...args) => registrations.push(args) },
      loadConnector: () => {
        imports++;
        return Promise.resolve({ ...local, installLocalGuideDisclosure() { disclosures++; } });
      }
    }, { timeout: 500 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(imports, expected);
    assert.equal(registrations.length, expected);
    assert.equal(disclosures, expected);
    if (expected) assert.equal(registrations[0][0], 'hallway-guide');
  }
  assert.match(main, /dialogue\.start\(hallwayGuide, \{ allowQuestionProvider: false \}\)/);
});

test('local connector: only fixed default and advanced catalogs can be selected', () => {
  assert.deepEqual(localGuideCatalogForSearch().topicIds, ['folded-machines', 'glass-gardens']);
  assert.equal(localGuideCatalogForSearch('?guideProfile=retrieval-quality'), LOCAL_GUIDE_RETRIEVAL_QUALITY_CATALOG);
  for (const profile of ['../../private.json', 'production', 'https://example.test', 'unknown']) {
    assert.throws(() => local.createHallwayLocalQuestionProvider({ search: '?guideProfile=' + encodeURIComponent(profile) }), /allowlisted/);
  }
});

test('local connector: fixed hallway identity, fixed endpoint, canonical source and informational fictional route', async () => {
  let calls = 0;
  const provider = local.createHallwayLocalQuestionProvider({ fetchImpl: async (url, init) => {
    calls++; assert.equal(url, LOCAL_GUIDE_ENDPOINT);
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    return new Response(JSON.stringify(envelope(JSON.parse(init.body))));
  } });
  assert.equal(provider.npcId, 'hallway-guide');
  assert.match(provider.disclosure, /DEVELOPMENT PREVIEW/);
  const outcome = await provider.ask('How do folded machines move?');
  assert.match(outcome.response, /Fictional Folded Machines Guide/);
  assert.match(outcome.response, /Fictional Imaginary Workshop/);
  assert.match(outcome.response, /informational only; it does not move/);
  assert.match(outcome.response, /source-folded-machines-handbook/);
  assert.equal(provider.navigate, undefined);
  assert.equal(provider.switchZone, undefined);
  assert.equal(calls, 1);
  assert.deepEqual(provider.getState().topicIds, ['folded-machines']);
  provider.reset();
  assert.deepEqual(provider.getState().topicIds, []);
});

test('local connector: a reset propagates stale cancellation without formatting an answer', async () => {
  let signal;
  const provider = local.createHallwayLocalQuestionProvider({ fetchImpl: (url, init) => {
    signal = init.signal; return new Promise(() => {});
  } });
  const pending = provider.ask('How do folded machines move?');
  await new Promise(resolve => setImmediate(resolve));
  provider.reset();
  const outcome = await pending;
  assert.equal(outcome.stale, true); assert.equal(outcome.response, '');
  assert.equal(signal.aborted, true);
});

test('local connector: disclosure is accessible, text-only and installed only once', () => {
  const elements = new Map();
  const document = {
    getElementById: id => elements.get(id),
    createElement: () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
      set innerHTML(value) { throw new Error('Do not use HTML'); } }),
    body: { appendChild(el) { elements.set(el.id, el); } }
  };
  const first = local.installLocalGuideDisclosure(document);
  assert.equal(first, local.installLocalGuideDisclosure(document));
  assert.equal(elements.size, 1);
  assert.equal(first.attrs.role, 'status');
  assert.equal(first.attrs['aria-live'], 'polite');
  assert.match(first.textContent, /Fictional information only/);
});
