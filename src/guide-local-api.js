import {
  GUIDE_API_SCHEMA_VERSION,
  validateGuideRequest,
  validateGuideResponse
} from './guide-api-contract.js';

export const LOCAL_GUIDE_ENDPOINT = 'http://127.0.0.1:4188/guide';

export const LOCAL_GUIDE_CATALOG = Object.freeze({
  topicIds: Object.freeze(['folded-machines', 'glass-gardens']),
  specialistNpcIds: Object.freeze([
    'npc-folded-machines-guide',
    'npc-glass-gardens-guide'
  ]),
  zoneIds: Object.freeze(['zone-imaginary-workshop', 'zone-prism-conservatory']),
  factIds: Object.freeze([
    'fact-folded-machines-motion',
    'fact-glass-gardens-light',
    'fact-glass-gardens-patterns'
  ]),
  sourceIds: Object.freeze([
    'source-folded-machines-handbook',
    'source-glass-garden-notes'
  ]),
  knowledgeVersions: Object.freeze(['fictional-2026-10-23.2']),
  factSourceIds: Object.freeze({
    'fact-folded-machines-motion': 'source-folded-machines-handbook',
    'fact-glass-gardens-light': 'source-glass-garden-notes',
    'fact-glass-gardens-patterns': 'source-glass-garden-notes'
  }),
  specialistRoutes: Object.freeze({
    'npc-folded-machines-guide': Object.freeze({
      destinationZoneId: 'zone-imaginary-workshop',
      canonicalDirections:
        'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.'
    }),
    'npc-glass-gardens-guide': Object.freeze({
      destinationZoneId: 'zone-prism-conservatory',
      canonicalDirections:
        'From the fictional guide marker, follow the violet glass tiles to the prism conservatory.'
    })
  }),
  specialistNames: Object.freeze({
    'npc-folded-machines-guide': 'Fictional Folded Machines Guide',
    'npc-glass-gardens-guide': 'Fictional Glass Gardens Guide'
  }),
  zoneNames: Object.freeze({
    'zone-imaginary-workshop': 'Fictional Imaginary Workshop',
    'zone-prism-conservatory': 'Fictional Prism Conservatory'
  }),
  zoneDirections: Object.freeze({
    'zone-imaginary-workshop':
      'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.',
    'zone-prism-conservatory':
      'From the fictional guide marker, follow the violet glass tiles to the prism conservatory.'
  })
});

let fallbackRequestSequence = 0;

function requestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `local-${globalThis.crypto.randomUUID()}`;
  }
  fallbackRequestSequence += 1;
  return `local-${Date.now().toString(36)}-${fallbackRequestSequence.toString(36)}`;
}

function assertLoopbackEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError('The local guide endpoint is invalid.');
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.port !== '4188' || url.pathname !== '/guide' || url.search || url.hash) {
    throw new TypeError('The guide preview accepts only the fixed loopback endpoint.');
  }
  return url.href;
}

function emptyContext() {
  return {
    topicIds: [],
    specialistNpcIds: [],
    destinationZoneIds: []
  };
}

function nextContext(current, envelope) {
  if (envelope.outcome !== 'answered') return current;
  return {
    topicIds: envelope.topicId ? [envelope.topicId] : [],
    specialistNpcIds: envelope.specialistNpcId ? [envelope.specialistNpcId] : [],
    destinationZoneIds: envelope.destinationZoneId ? [envelope.destinationZoneId] : []
  };
}

function resultFromEnvelope(envelope) {
  const type = envelope.outcome === 'answered'
    ? (envelope.specialistNpcId ? 'route' : 'answer')
    : envelope.outcome === 'clarify' ? 'clarify' : 'fallback';
  return Object.freeze({
    type,
    topicId: envelope.topicId,
    response: envelope.answerText,
    destinationNpcId: envelope.specialistNpcId,
    specialistName: envelope.specialistName ?? null,
    destinationZoneId: envelope.destinationZoneId,
    destinationZoneName: envelope.destinationZoneName ?? null,
    directions: envelope.canonicalDirections,
    score: 0
  });
}

/**
 * Browser-only development client for the localhost Worker shim. State is
 * memory-only and contains canonical IDs, never questions or transcripts.
 */
export function createLocalGuideSession(options = {}) {
  const endpoint = assertLoopbackEndpoint(options.endpoint ?? LOCAL_GUIDE_ENDPOINT);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const catalog = options.catalog ?? LOCAL_GUIDE_CATALOG;
  const requestTimeoutMs = Number.isInteger(options.requestTimeoutMs) &&
    options.requestTimeoutMs > 0 && options.requestTimeoutMs <= 30000
    ? options.requestTimeoutMs
    : 4000;
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('The local guide requires a fetch implementation.');
  }

  let context = emptyContext();
  let activeController = null;
  let version = 0;

  return Object.freeze({
    async ask(question) {
      activeController?.abort('superseded');
      const controller = new AbortController();
      activeController = controller;
      const requestVersion = ++version;
      const id = requestId();
      const body = {
        schemaVersion: GUIDE_API_SCHEMA_VERSION,
        requestId: id,
        question,
        temporaryContext: {
          topicIds: [...context.topicIds],
          specialistNpcIds: [...context.specialistNpcIds],
          destinationZoneIds: [...context.destinationZoneIds]
        }
      };
      const requestValidation = validateGuideRequest(body, { catalog });
      if (!requestValidation.valid) {
        throw new Error('The local guide request is invalid.');
      }

      const timeoutId = setTimeout(
        () => controller.abort('local_backend_timeout'),
        requestTimeoutMs
      );
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        if (requestVersion !== version) {
          return Object.freeze({ stale: true, result: null, response: '' });
        }

        let envelope;
        try {
          envelope = await response.json();
        } catch (error) {
          if (controller.signal.reason === 'local_backend_timeout') throw error;
          throw new Error('The local guide returned invalid JSON.', { cause: error });
        }
        const responseValidation = validateGuideResponse(envelope, {
          catalog,
          expectedRequestId: id
        });
        if (!responseValidation.valid) {
          throw new Error('The local guide returned an invalid response.');
        }

        context = nextContext(context, envelope);
        const result = resultFromEnvelope(envelope);
        return Object.freeze({
          stale: false,
          envelope: Object.freeze(envelope),
          result,
          response: result.response
        });
      } catch (error) {
        const staleReason = controller.signal.reason === 'superseded' ||
          controller.signal.reason === 'conversation_reset';
        if (requestVersion !== version || staleReason) {
          return Object.freeze({ stale: true, result: null, response: '' });
        }
        if (error?.message === 'The local guide returned invalid JSON.' ||
            error?.message === 'The local guide returned an invalid response.') {
          throw error;
        }
        throw new Error('The local guide backend is unavailable.', { cause: error });
      } finally {
        clearTimeout(timeoutId);
        if (activeController === controller) activeController = null;
      }
    },

    reset() {
      version += 1;
      activeController?.abort('conversation_reset');
      activeController = null;
      context = emptyContext();
      return this.getState();
    },

    getState() {
      return Object.freeze({
        topicIds: Object.freeze([...context.topicIds]),
        specialistNpcIds: Object.freeze([...context.specialistNpcIds]),
        destinationZoneIds: Object.freeze([...context.destinationZoneIds])
      });
    }
  });
}
