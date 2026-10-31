import {
  GUIDE_API_LEGACY_SCHEMA_VERSION,
  GUIDE_API_SCHEMA_VERSION,
  MAX_GUIDE_ANSWER_LENGTH,
  MAX_GUIDE_QUESTION_LENGTH,
  validateGuideRequest,
  validateGuideResponse
} from '../../src/guide-api-contract.js';
import { matchQuestion, normalizeQuestion } from '../../src/guide-qa.js';
import { classifyFollowUp, handleGuideQuestion } from '../../src/guide-conversation.js';
import {
  createModelRequest,
  validateModelResponse
} from '../../src/guide-ai-orchestrator.js';

const DEFAULT_MAX_BODY_BYTES = 4096;
const DEFAULT_MODEL_TIMEOUT_MS = 2000;
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const PRODUCTION_TOUR_ZONES = new Set(['hallway', 'printing-room', 'project-studio']);
// Original handoff forms, used only after the validated synthetic gate below.
const SYNTHETIC_DESTINATION_FOLLOW_UPS = new Set([
  'what route reaches that guide',
  'what route reaches them',
  'where can i find that',
  'where should i go',
  'where should i go for it'
]);

class ModelInvocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ModelInvocationError';
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function safeLog(logger, event, details = {}) {
  if (typeof logger !== 'function') return;
  try {
    logger(Object.freeze({ event, ...details }));
  } catch {
    // Observability must never change visitor-facing behavior.
  }
}

function requestOrigin(request) {
  const origin = request.headers.get('origin');
  return typeof origin === 'string' && origin.trim() ? origin.trim() : null;
}

function originDecision(request, settings) {
  const origin = requestOrigin(request);
  if (origin === null) return { allowed: settings.allowMissingOrigin, origin: null };
  return { allowed: origin !== '*' && settings.allowedOrigins.has(origin), origin };
}

function responseHeaders(origin, corsAllowed) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': JSON_CONTENT_TYPE,
    'Vary': 'Origin'
  });
  if (origin && corsAllowed) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonResponse(body, status, origin, corsAllowed = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin, corsAllowed)
  });
}

function httpError(code, message, status, origin, corsAllowed = false) {
  return jsonResponse({
    schemaVersion: GUIDE_API_SCHEMA_VERSION,
    error: { code, message }
  }, status, origin, corsAllowed);
}

function contentTypeIsJson(request) {
  const value = request.headers.get('content-type');
  return typeof value === 'string' && value.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

async function readJsonBody(request, maximumBytes) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maximumBytes) {
      return { ok: false, code: 'body_too_large', status: 413 };
    }
  }

  let buffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, code: 'invalid_body', status: 400 };
  }
  if (buffer.byteLength > maximumBytes) {
    return { ok: false, code: 'body_too_large', status: 413 };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, code: 'invalid_json', status: 400 };
  }
}

function lastIdentifier(values) {
  return Array.isArray(values) && values.length ? values[values.length - 1] : null;
}

function createConversationContext(temporaryContext, knowledge) {
  const state = Object.freeze({
    lastTopicId: lastIdentifier(temporaryContext.topicIds),
    lastDestinationNpcId: lastIdentifier(temporaryContext.specialistNpcIds),
    lastDestinationZoneId: lastIdentifier(temporaryContext.destinationZoneIds)
  });

  const hasSpecialist = state.lastDestinationNpcId !== null;
  const hasZone = state.lastDestinationZoneId !== null;
  if (hasSpecialist !== hasZone || (hasSpecialist && state.lastTopicId === null)) return null;
  if (!hasSpecialist) return state;

  const specialist = knowledge.getSpecialist(state.lastDestinationNpcId);
  const zone = knowledge.getZone(state.lastDestinationZoneId);
  if (!specialist || !zone ||
      specialist.destinationZoneId !== zone.id ||
      !specialist.topicIds.includes(state.lastTopicId)) {
    return null;
  }

  return state;
}

async function controlAllows(control, details) {
  if (control === null || control === undefined) return true;
  if (typeof control.check !== 'function') return false;
  try {
    const decision = await control.check(Object.freeze({ ...details }));
    return decision === true || decision?.allowed === true;
  } catch {
    return false;
  }
}

function abortReasonCode(reason) {
  return reason === 'model_timeout' ? 'provider_timeout' : 'provider_unavailable';
}

async function invokeModel(model, modelRequest, upstreamSignal, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;
  let upstreamAbort;

  const abortPromise = new Promise((resolve, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(new ModelInvocationError(
        abortReasonCode(controller.signal.reason),
        'Model invocation was aborted.'
      ));
    }, { once: true });
  });

  if (upstreamSignal) {
    upstreamAbort = () => controller.abort('request_aborted');
    upstreamSignal.addEventListener('abort', upstreamAbort, { once: true });
    if (upstreamSignal.aborted) upstreamAbort();
  }

  timeoutId = setTimeout(() => controller.abort('model_timeout'), timeoutMs);
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) {
          throw new ModelInvocationError(
            abortReasonCode(controller.signal.reason), 'Model invocation was aborted.'
          );
        }
        return model.generateResponse(modelRequest, Object.freeze({ signal: controller.signal }));
      }),
      abortPromise
    ]);
  } catch (error) {
    if (error instanceof ModelInvocationError) throw error;
    if (controller.signal.aborted) {
      throw new ModelInvocationError(
        abortReasonCode(controller.signal.reason),
        'Model invocation was aborted.'
      );
    }
    throw new ModelInvocationError('provider_unavailable', 'Model invocation failed.');
  } finally {
    clearTimeout(timeoutId);
    if (upstreamSignal && upstreamAbort) {
      upstreamSignal.removeEventListener('abort', upstreamAbort);
    }
  }
}

function canonicalRoute(result, knowledge) {
  const specialistId = result.destinationNpcId ?? null;
  const zoneId = result.destinationZoneId ?? null;
  if (specialistId === null && zoneId === null) {
    return {
      specialistNpcId: null,
      specialistName: null,
      destinationZoneId: null,
      destinationZoneName: null,
      canonicalDirections: null
    };
  }
  if (specialistId === null || zoneId === null) return null;
  const classification = knowledge.approved?.contentClassification;
  if (classification !== 'synthetic_fixture' &&
      (classification !== 'production' || !PRODUCTION_TOUR_ZONES.has(zoneId))) return null;

  const specialist = knowledge.getSpecialist(specialistId);
  const zone = knowledge.getZone(zoneId);
  if (!specialist || !zone ||
      specialist.destinationZoneId !== zone.id ||
      !specialist.topicIds.includes(result.topicId)) {
    return null;
  }

  return Object.freeze({
    specialistNpcId: specialist.id,
    specialistName: specialist.name,
    destinationZoneId: zone.id,
    destinationZoneName: zone.name,
    canonicalDirections: zone.canonicalDirections
  });
}

function matchedRetrievalResult(retrieval, knowledge) {
  if (retrieval?.outcome === 'ambiguous' || retrieval?.outcome === 'conflict') {
    return {
      type: 'clarify',
      topicId: null,
      response: retrieval.outcome === 'conflict'
        ? 'The approved sources conflict, so I cannot provide that answer yet.'
        : 'Could you clarify which approved topic you mean?',
      score: 0
    };
  }
  if (retrieval?.outcome !== 'matched' || !retrieval.topicId || !retrieval.results?.length) {
    return null;
  }

  const topic = knowledge.legacy.topics.find((entry) => entry.id === retrieval.topicId);
  if (!topic) return null;
  const score = retrieval.results[0].score;
  if (topic.type === 'route') {
    return {
      type: 'route',
      topicId: topic.id,
      response: topic.response,
      destinationNpcId: topic.destinationNpcId,
      destinationZoneId: topic.destinationZoneId,
      score
    };
  }
  return {
    type: 'answer',
    topicId: topic.id,
    response: topic.response,
    score
  };
}

// The browser conversation module deliberately accepts only the three tour zones.
// Only validated synthetic fixtures may use fictional catalog routes here.
// Production resolution retains the browser's existing three-zone policy.
function resolveWorkerQuestion(question, knowledge, context, matcher) {
  let matched;
  const resolution = handleGuideQuestion(question, knowledge.legacy, context, {
    matchQuestion(...args) {
      matched = matcher(...args);
      return matched;
    }
  });
  // A remembered route must not override fresh ambiguity or conflicting evidence.
  if (matched?.type === 'clarify') return { result: matched, state: resolution.state };
  if (resolution.result.type === 'answer' || resolution.result.type === 'route') {
    return resolution;
  }

  if (knowledge.approved?.contentClassification !== 'synthetic_fixture') return resolution;

  let result = matched;
  if (matched?.type !== 'answer' && matched?.type !== 'route') {
    // Only explicit, recognized follow-ups may reuse validated route context.
    // New ambiguity/conflict must never be turned into a confident answer.
    const isFollowUp = Boolean(classifyFollowUp(question)) ||
      SYNTHETIC_DESTINATION_FOLLOW_UPS.has(normalizeQuestion(question));
    if (matched?.type === 'clarify' || !isFollowUp ||
        !context.lastDestinationNpcId || !context.lastDestinationZoneId) return resolution;
    const topic = knowledge.legacy.topics.find((entry) => entry.id === context.lastTopicId);
    if (!topic) return resolution;
    result = {
      type: 'route',
      topicId: topic.id,
      response: topic.response,
      destinationNpcId: context.lastDestinationNpcId,
      destinationZoneId: context.lastDestinationZoneId,
      score: 0
    };
  }
  const topic = knowledge.legacy.topics.find((entry) => entry.id === result?.topicId);
  if (result?.type !== 'route' || topic?.type !== 'route' ||
      result.response !== topic.response ||
      topic.destinationNpcId !== result.destinationNpcId ||
      topic.destinationZoneId !== result.destinationZoneId ||
      !Number.isFinite(result.score) || result.score < 0 ||
      !canonicalRoute(result, knowledge)) return resolution;
  return {
    result,
    state: Object.freeze({
      lastTopicId: topic.id,
      lastDestinationNpcId: topic.destinationNpcId,
      lastDestinationZoneId: topic.destinationZoneId
    })
  };
}

function retrievalTopicProjection(topic, retrieval) {
  if (!topic || retrieval?.outcome !== 'matched' || retrieval.topicId !== topic.id) return topic;
  const selected = new Set(retrieval.results.map((entry) => entry.factId));
  const facts = topic.facts.filter((fact) => selected.has(fact.id));
  if (!facts.length) return null;
  return Object.freeze({ ...topic, facts: Object.freeze(facts) });
}

function baseEnvelope(requestId, knowledgeVersion, overrides, schemaVersion) {
  const envelope = {
    schemaVersion,
    requestId,
    outcome: overrides.outcome,
    answerText: overrides.answerText,
    factReferences: overrides.factReferences ?? [],
    topicId: overrides.topicId ?? null,
    specialistNpcId: overrides.specialistNpcId ?? null,
    destinationZoneId: overrides.destinationZoneId ?? null,
    canonicalDirections: overrides.canonicalDirections ?? null,
    knowledgeVersion,
    error: overrides.error ?? null
  };
  if (schemaVersion !== GUIDE_API_LEGACY_SCHEMA_VERSION) {
    envelope.specialistName = overrides.specialistName ?? null;
    envelope.destinationZoneName = overrides.destinationZoneName ?? null;
  }
  return envelope;
}

function validatedGuideResponse(envelope, status, requestId, knowledge, origin) {
  const validation = validateGuideResponse(envelope, {
    catalog: knowledge.catalog,
    expectedRequestId: requestId,
    maxAnswerLength: MAX_GUIDE_ANSWER_LENGTH
  });
  if (!validation.valid) {
    return httpError(
      'response_validation_failed',
      'The guide could not create a safe response.',
      500,
      origin,
      true
    );
  }
  return jsonResponse(envelope, status, origin, true);
}

function unavailableResponse(
  requestId,
  knowledge,
  code,
  answerText,
  status,
  origin,
  schemaVersion
) {
  return validatedGuideResponse(baseEnvelope(requestId, knowledge.knowledgeVersion, {
    outcome: 'unavailable',
    answerText,
    error: { code }
  }, schemaVersion), status, requestId, knowledge, origin);
}

export function createGuideHandler(options = {}) {
  if (typeof options.loadKnowledge !== 'function') {
    throw new TypeError('loadKnowledge must be an injected function.');
  }
  if (!isRecord(options.model) || typeof options.model.generateResponse !== 'function') {
    throw new TypeError('model.generateResponse must be an injected function.');
  }

  const settings = Object.freeze({
    loadKnowledge: options.loadKnowledge,
    model: options.model,
    allowedOrigins: new Set(Array.isArray(options.allowedOrigins) ? options.allowedOrigins : []),
    allowMissingOrigin: options.allowMissingOrigin !== false,
    rateLimiter: options.rateLimiter ?? null,
    budgetGuard: options.budgetGuard ?? null,
    logger: options.logger,
    maxBodyBytes: positiveInteger(options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES),
    modelTimeoutMs: positiveInteger(options.modelTimeoutMs, DEFAULT_MODEL_TIMEOUT_MS)
  });

  return async function handleGuideRequest(request) {
    if (!request || !request.headers || typeof request.method !== 'string') {
      return httpError('invalid_request', 'Expected a Request object.', 400, null);
    }

    const origin = originDecision(request, settings);
    if (!origin.allowed) {
      safeLog(settings.logger, 'origin_rejected', { status: 403 });
      return httpError('origin_not_allowed', 'Request origin is not allowed.', 403, origin.origin);
    }

    if (request.method === 'OPTIONS') {
      const headers = responseHeaders(origin.origin, true);
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      const response = httpError('method_not_allowed', 'Only POST is allowed.', 405, origin.origin, true);
      response.headers.set('Allow', 'POST, OPTIONS');
      return response;
    }
    if (!contentTypeIsJson(request)) {
      return httpError(
        'unsupported_media_type',
        'Content-Type must be application/json.',
        415,
        origin.origin,
        true
      );
    }

    const parsed = await readJsonBody(request, settings.maxBodyBytes);
    if (!parsed.ok) {
      safeLog(settings.logger, 'request_body_rejected', { status: parsed.status });
      return httpError(parsed.code, 'Request body was rejected.', parsed.status, origin.origin, true);
    }

    let knowledge;
    try {
      knowledge = await settings.loadKnowledge();
    } catch {
      safeLog(settings.logger, 'knowledge_unavailable', { status: 503 });
      return httpError(
        'knowledge_unavailable',
        'Approved knowledge is temporarily unavailable.',
        503,
        origin.origin,
        true
      );
    }

    const requestValidation = validateGuideRequest(parsed.value, {
      catalog: knowledge.catalog,
      maxQuestionLength: MAX_GUIDE_QUESTION_LENGTH
    });
    if (!requestValidation.valid) {
      safeLog(settings.logger, 'request_schema_rejected', { status: 400 });
      return httpError('invalid_request', 'Request schema is invalid.', 400, origin.origin, true);
    }

    const requestId = parsed.value.requestId;
    const schemaVersion = parsed.value.schemaVersion;
    const context = createConversationContext(parsed.value.temporaryContext, knowledge);
    if (!context) {
      safeLog(settings.logger, 'request_context_rejected', { requestId, status: 400 });
      return httpError('invalid_context', 'Temporary context is inconsistent.', 400, origin.origin, true);
    }

    const controlDetails = { requestId, origin: origin.origin };
    if (!await controlAllows(settings.rateLimiter, controlDetails)) {
      safeLog(settings.logger, 'rate_limited', { requestId, status: 429 });
      return unavailableResponse(
        requestId,
        knowledge,
        'rate_limited',
        'The guide is receiving too many requests. Please try again shortly.',
        429,
        origin.origin,
        schemaVersion
      );
    }
    if (!await controlAllows(settings.budgetGuard, controlDetails)) {
      safeLog(settings.logger, 'budget_unavailable', { requestId, status: 503 });
      return unavailableResponse(
        requestId,
        knowledge,
        'provider_unavailable',
        'The guide has reached its current usage limit. Please try again later.',
        503,
        origin.origin,
        schemaVersion
      );
    }

    let retrieval = null;
    const approvedRetrievalMatcher = (question, topics, matcherOptions) => {
      if (typeof knowledge.retrieve !== 'function') {
        return matchQuestion(question, topics, matcherOptions);
      }
      retrieval = knowledge.retrieve(question, { limit: 4 });
      const retrieved = matchedRetrievalResult(retrieval, knowledge);
      if (retrieved) return retrieved;
      if (knowledge.retrievalProfileVersion &&
          (retrieval?.outcome === 'unsupported' || retrieval?.outcome === 'invalid')) {
        return {
          type: 'fallback',
          topicId: null,
          response: "I don't have a verified answer for that question.",
          score: 0
        };
      }
      return matchQuestion(question, topics, matcherOptions);
    };
    const resolution = resolveWorkerQuestion(
      parsed.value.question,
      knowledge,
      context,
      approvedRetrievalMatcher
    );
    const deterministic = resolution.result;

    if (deterministic.type === 'fallback' || deterministic.type === 'clarify') {
      const outcome = deterministic.type === 'clarify' ? 'clarify' : 'unsupported';
      const envelope = baseEnvelope(requestId, knowledge.knowledgeVersion, {
        outcome,
        answerText: deterministic.response
      }, schemaVersion);
      safeLog(settings.logger, 'guide_response', { requestId, outcome, status: 200 });
      return validatedGuideResponse(envelope, 200, requestId, knowledge, origin.origin);
    }

    const topic = retrievalTopicProjection(
      knowledge.legacy.topics.find((entry) => entry.id === deterministic.topicId),
      retrieval
    );
    const modelRequest = createModelRequest(
      parsed.value.question,
      topic,
      resolution.state,
      { maxQuestionLength: MAX_GUIDE_QUESTION_LENGTH }
    );
    const route = canonicalRoute(deterministic, knowledge);
    if (!modelRequest || !route) {
      safeLog(settings.logger, 'authoritative_resolution_failed', { requestId, status: 503 });
      return unavailableResponse(
        requestId,
        knowledge,
        'internal_error',
        'The guide could not safely resolve that answer.',
        503,
        origin.origin,
        schemaVersion
      );
    }

    let modelOutput;
    try {
      modelOutput = await invokeModel(
        settings.model,
        modelRequest,
        request.signal,
        settings.modelTimeoutMs
      );
    } catch (error) {
      const code = error instanceof ModelInvocationError ? error.code : 'provider_unavailable';
      safeLog(settings.logger, 'model_unavailable', { requestId, status: 503, code });
      return unavailableResponse(
        requestId,
        knowledge,
        code,
        'The guide is temporarily unavailable. Please try again.',
        503,
        origin.origin,
        schemaVersion
      );
    }

    const modelValidation = validateModelResponse(
      modelOutput,
      deterministic.topicId,
      modelRequest.allowedFactIds,
      { maxAnswerLength: MAX_GUIDE_ANSWER_LENGTH }
    );
    if (!modelValidation.valid) {
      safeLog(settings.logger, 'model_output_rejected', { requestId, status: 503 });
      return unavailableResponse(
        requestId,
        knowledge,
        'internal_error',
        'The guide could not validate the generated answer.',
        503,
        origin.origin,
        schemaVersion
      );
    }

    const factReferences = knowledge.createFactReferences(modelValidation.value.usedFactIds);
    const evidenceBoundAnswer = knowledge.createEvidenceBoundAnswer(
      modelValidation.value.usedFactIds
    );
    if (!factReferences || !evidenceBoundAnswer) {
      return unavailableResponse(
        requestId,
        knowledge,
        'internal_error',
        'The guide could not validate the answer references.',
        503,
        origin.origin,
        schemaVersion
      );
    }

    const envelope = baseEnvelope(requestId, knowledge.knowledgeVersion, {
      outcome: 'answered',
      answerText: evidenceBoundAnswer,
      factReferences,
      topicId: deterministic.topicId,
      ...route
    }, schemaVersion);
    safeLog(settings.logger, 'guide_response', { requestId, outcome: 'answered', status: 200 });
    return validatedGuideResponse(envelope, 200, requestId, knowledge, origin.origin);
  };
}
