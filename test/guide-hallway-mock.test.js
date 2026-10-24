import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  GUIDE_MOCK_DISCLOSURE,
  HALLWAY_GUIDE_ID,
  createHallwayGuideQuestionProvider,
  formatGuideMockResult,
  installGuideMockDisclosure,
  isGuideMockEnabled,
  isGuideLocalBackendEnabled,
  isGuideMockModelFailureEnabled
} from '../src/guide-hallway-mock.js';
import { PREVIEW_KNOWLEDGE } from '../src/guide-preview-knowledge.js';

test('mock mode requires development mode and the explicit URL flag', () => {
  const enabled = '?guideMock=1&guideBackend=local';
  assert.equal(isGuideMockEnabled({ isDevelopment: true, search: enabled }), true);
  assert.equal(isGuideMockEnabled({ isDevelopment: true, search: '?guideMock=1' }), false);
  assert.equal(isGuideMockEnabled({ isDevelopment: true, search: '?guideBackend=local' }), false);
  assert.equal(isGuideMockEnabled({ isDevelopment: true, search: '' }), false);
  assert.equal(isGuideMockEnabled({ isDevelopment: true, search: '?guideMock=0' }), false);
  assert.equal(isGuideMockEnabled({ isDevelopment: false, search: enabled }), false);
  assert.equal(isGuideLocalBackendEnabled(enabled), true);
});

test('mock model failure is a separate opt-in mode', () => {
  assert.equal(isGuideMockModelFailureEnabled('?guideMock=1&guideMockFailure=1'), true);
  assert.equal(isGuideMockModelFailureEnabled('?guideMock=1'), false);
});

test('provider reuses the production hallway guide identity', () => {
  const provider = createHallwayGuideQuestionProvider();
  assert.equal(provider.npcId, 'hallway-guide');
  assert.equal(provider.npcId, HALLWAY_GUIDE_ID);
  assert.equal(provider.disclosure, GUIDE_MOCK_DISCLOSURE);
});

test('provider creation does not modify or duplicate production NPC configuration', () => {
  const configText = readFileSync(new URL('../public/zones.json', import.meta.url), 'utf8');
  const config = JSON.parse(configText);
  const before = structuredClone(config);

  createHallwayGuideQuestionProvider();

  assert.deepEqual(config, before);
  const hallway = config.zones.find((zone) => zone.id === 'hallway');
  const hallwayGuides = hallway.npcs.filter((npc) => npc.id === HALLWAY_GUIDE_ID);
  assert.equal(hallwayGuides.length, 1);
  assert.deepEqual(hallwayGuides[0].position, [0, 1.6, -3]);
  assert.equal(hallwayGuides[0].radius, 2.0);
});

test('typed questions use the existing simulated Stage 2 through 4 pipeline', async () => {
  const provider = createHallwayGuideQuestionProvider();
  const outcome = await provider.ask('What is paper robotics?');

  assert.equal(outcome.stale, false);
  assert.equal(outcome.result.topicId, 'paper-robotics-overview');
  assert.match(outcome.response, /^Simulated guide response:/);
});

test('only approved fictional facts are supplied to simulated generation', async () => {
  let capturedRequest = null;
  const provider = createHallwayGuideQuestionProvider({
    generateResponse(request) {
      capturedRequest = request;
      return {
        supported: true,
        topicId: request.topicId,
        answerText: 'A response based only on the supplied fictional fact.',
        usedFactIds: [...request.allowedFactIds]
      };
    }
  });

  await provider.ask('What is paper robotics?');

  assert.ok(capturedRequest);
  assert.deepEqual(capturedRequest.allowedFactIds, ['paper-robotics-definition']);
  assert.deepEqual(capturedRequest.facts, [{
    id: 'paper-robotics-definition',
    text: 'In this fictional preview, paper robotics uses folded materials to demonstrate mechanical motion.'
  }]);
});

test('specialist recommendations preserve canonical fictional destination IDs', async () => {
  const provider = createHallwayGuideQuestionProvider();
  const outcome = await provider.ask('Who can teach me paper robotics?');

  assert.equal(outcome.result.destinationNpcId, 'npc-paper-specialist');
  assert.equal(outcome.result.destinationZoneId, 'zone-paper-workshop');
  assert.match(outcome.response, /Parker, the fictional paper-robotics specialist/);
  assert.match(outcome.response, /Fictional Paper Workshop/);
});

test('destination follow-up uses remembered specialist context', async () => {
  const provider = createHallwayGuideQuestionProvider();
  await provider.ask('Who can teach me paper robotics?');
  const outcome = await provider.ask('Where can I find them?');

  assert.match(outcome.response, /fictional paper workshop beside the blue model display/);
  assert.equal(outcome.result.destinationNpcId, 'npc-paper-specialist');
});

test('expertise follow-up uses remembered specialist context', async () => {
  const provider = createHallwayGuideQuestionProvider();
  await provider.ask('Who can teach me paper robotics?');
  const outcome = await provider.ask('What do they specialize in?');

  assert.match(outcome.response, /fictional folded mechanisms/);
  assert.equal(outcome.result.destinationNpcId, 'npc-paper-specialist');
});

test('a new specialist topic replaces the previous context', async () => {
  const provider = createHallwayGuideQuestionProvider();
  await provider.ask('Who can teach me paper robotics?');
  await provider.ask('Who teaches glass-engine design?');
  const outcome = await provider.ask('Where can I find them?');

  assert.equal(outcome.result.destinationNpcId, 'npc-glass-specialist');
  assert.equal(outcome.result.destinationZoneId, 'zone-glass-lab');
  assert.match(outcome.response, /fictional glass lab beside the amber model cabinet/);
});

test('unsupported questions return a safe deterministic fallback', async () => {
  const provider = createHallwayGuideQuestionProvider();
  const outcome = await provider.ask('What is the weather tomorrow?');

  assert.equal(outcome.result.type, 'fallback');
  assert.equal(outcome.response, "I don't have a verified answer for that question.");
});

test('reset clears remembered specialist context', async () => {
  const provider = createHallwayGuideQuestionProvider();
  await provider.ask('Who can teach me paper robotics?');
  provider.reset();
  const outcome = await provider.ask('Where can I find them?');

  assert.equal(outcome.result.type, 'clarify');
  assert.match(outcome.response, /ask about a specialist first/i);
});

test('reset invalidates a pending response without restoring stale context', async () => {
  let finishGeneration;
  const provider = createHallwayGuideQuestionProvider({
    modelTimeoutMs: 5000,
    generateResponse(request) {
      return new Promise((resolve) => {
        finishGeneration = () => resolve({
          supported: true,
          topicId: request.topicId,
          answerText: 'Delayed fictional response.',
          usedFactIds: [...request.allowedFactIds]
        });
      });
    }
  });

  const pending = provider.ask('Who can teach me paper robotics?');
  while (!finishGeneration) await new Promise((resolve) => setImmediate(resolve));
  provider.reset();
  finishGeneration();

  const outcome = await pending;
  assert.equal(outcome.stale, true);
  assert.deepEqual(provider.getState(), {
    lastTopicId: null,
    lastDestinationNpcId: null,
    lastDestinationZoneId: null
  });
});

test('mock model failure falls back to the deterministic approved answer', async () => {
  const provider = createHallwayGuideQuestionProvider({
    search: '?guideMock=1&guideMockFailure=1'
  });
  const outcome = await provider.ask('Who can teach me paper robotics?');

  assert.equal(outcome.result.type, 'route');
  assert.match(outcome.response, /^I recommend the fictional paper-robotics specialist/);
  assert.doesNotMatch(outcome.response, /^Simulated guide response:/);
});

test('formatting exposes canonical fictional routing details but does not invent fallback data', () => {
  const routeText = formatGuideMockResult({
    type: 'route',
    response: 'A fictional specialist can help.',
    destinationNpcId: 'npc-paper-specialist',
    destinationZoneId: 'zone-paper-workshop',
    directions: 'Walk to the fictional paper workshop beside the blue model display.'
  }, PREVIEW_KNOWLEDGE);
  const fallbackText = formatGuideMockResult({
    type: 'fallback',
    response: "I don't have a verified answer for that question."
  }, PREVIEW_KNOWLEDGE);

  assert.match(routeText, /Parker, the fictional paper-robotics specialist/);
  assert.match(routeText, /Fictional Paper Workshop/);
  assert.equal(fallbackText, "I don't have a verified answer for that question.");
});

test('development disclosure is accessible and installed only once', () => {
  const elements = new Map();
  const documentRef = {
    body: {
      appendChild(element) {
        elements.set(element.id, element);
      }
    },
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    createElement() {
      const attributes = new Map();
      return {
        id: '',
        style: {},
        textContent: '',
        setAttribute(name, value) {
          attributes.set(name, value);
        },
        getAttribute(name) {
          return attributes.get(name) ?? null;
        }
      };
    }
  };

  const first = installGuideMockDisclosure(documentRef);
  const second = installGuideMockDisclosure(documentRef);

  assert.equal(first, second);
  assert.equal(first.getAttribute('role'), 'status');
  assert.equal(first.getAttribute('aria-live'), 'polite');
  assert.equal(first.textContent, GUIDE_MOCK_DISCLOSURE);
  assert.equal(elements.size, 1);
});

test('provider processing does not call a real network API', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('Unexpected network request.');
  };

  try {
    const provider = createHallwayGuideQuestionProvider();
    const outcome = await provider.ask('Who can teach me paper robotics?');
    assert.equal(outcome.result.type, 'route');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
