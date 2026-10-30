const MODEL_RESPONSE_FIELDS = Object.freeze([
  'answerText',
  'supported',
  'topicId',
  'usedFactIds'
]);

const TOUR_ZONES = new Set(['hallway', 'printing-room', 'project-studio']);

const DEFAULT_OPTIONS = Object.freeze({
  fallbackResponse: "I don't have a verified answer for that question.",
  maxAnswerLength: 600,
  maxContextValueLength: 128,
  maxQuestionLength: 300,
  modelTimeoutMs: 2000
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validId(value) {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function uniqueRecord(entries, id) {
  if (!validId(id) || !Array.isArray(entries)) return null;
  const matches = entries.filter((entry) => (
    isRecord(entry) && nonEmptyString(entry.id) && entry.id.trim() === id
  ));
  return matches.length === 1 && matches[0].id === id ? matches[0] : null;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function scoreOf(result) {
  return Number.isFinite(result?.score) ? result.score : 0;
}

function safeOptions(options) {
  return isRecord(options) ? options : {};
}

function fallbackResponse(options) {
  return nonEmptyString(options.fallbackResponse)
    ? options.fallbackResponse.trim()
    : DEFAULT_OPTIONS.fallbackResponse;
}

function fallbackResult(response) {
  return {
    type: 'fallback',
    topicId: null,
    response,
    score: 0
  };
}

function createOutcome(result, state) {
  return Object.freeze({
    result: Object.freeze(result),
    state
  });
}

function limitedContext(context, maxValueLength = DEFAULT_OPTIONS.maxContextValueLength) {
  const source = isRecord(context) ? context : {};
  const values = {};

  for (const key of [
    'lastTopicId',
    'lastDestinationNpcId',
    'lastDestinationZoneId'
  ]) {
    if (!nonEmptyString(source[key])) {
      values[key] = null;
      continue;
    }

    const value = source[key].trim();
    if (value.length > maxValueLength) return null;
    values[key] = value;
  }

  return Object.freeze({
    lastTopicId: values.lastTopicId,
    lastDestinationNpcId: values.lastDestinationNpcId,
    lastDestinationZoneId: values.lastDestinationZoneId
  });
}

function approvedFactsForTopic(topic) {
  if (!isRecord(topic) || topic.status !== 'verified' || !Array.isArray(topic.facts)) return null;

  const facts = [];
  const ids = new Set();
  for (const fact of topic.facts) {
    if (!isRecord(fact) || !nonEmptyString(fact.id)) continue;

    const id = fact.id.trim();
    if (ids.has(id)) return null;
    ids.add(id);

    if (fact.status !== 'approved' || !nonEmptyString(fact.text)) continue;
    facts.push(Object.freeze({ id, text: fact.text.trim() }));
  }

  return facts.length ? Object.freeze(facts) : null;
}

function normalizeResolution(resolution, currentState) {
  const hasEnvelope = isRecord(resolution) && isRecord(resolution.result);
  return {
    result: hasEnvelope ? resolution.result : resolution,
    state: hasEnvelope && isRecord(resolution.state) ? resolution.state : currentState
  };
}

function normalizeDeterministicResult(result) {
  if (!isRecord(result) || !nonEmptyString(result.response) ||
      !Number.isFinite(result.score) || result.score < 0) return null;

  if (result.type === 'fallback' || result.type === 'clarify') {
    if (result.topicId !== null || result.destinationNpcId !== undefined ||
        result.destinationZoneId !== undefined) return null;
    return {
      type: result.type,
      topicId: null,
      response: result.response.trim(),
      score: scoreOf(result)
    };
  }

  if ((result.type !== 'answer' && result.type !== 'route') ||
      !validId(result.topicId)) {
    return null;
  }

  const normalized = {
    type: result.type,
    topicId: result.topicId.trim(),
    response: result.response.trim(),
    score: scoreOf(result)
  };

  if (result.type === 'route') {
    if (!validId(result.destinationNpcId) ||
        !validId(result.destinationZoneId)) {
      return null;
    }
    normalized.destinationNpcId = result.destinationNpcId.trim();
    normalized.destinationZoneId = result.destinationZoneId.trim();
  } else {
    const hasNpcId = result.destinationNpcId !== undefined;
    const hasZoneId = result.destinationZoneId !== undefined;
    if (hasNpcId !== hasZoneId) return null;
    if (hasNpcId) {
      if (!validId(result.destinationNpcId) || !validId(result.destinationZoneId)) return null;
      normalized.destinationNpcId = result.destinationNpcId.trim();
      normalized.destinationZoneId = result.destinationZoneId.trim();
    }
  }

  return normalized;
}

function verifiedTopic(knowledge, topicId) {
  const topic = uniqueRecord(knowledge?.topics, topicId);
  return topic?.status === 'verified' &&
    (topic.type === 'answer' || topic.type === 'route') &&
    nonEmptyString(topic.response) ? topic : null;
}

function canonicalRoute(knowledge, topic, result) {
  if (topic.type !== 'route' || !TOUR_ZONES.has(result.destinationZoneId) ||
      topic.destinationNpcId !== result.destinationNpcId ||
      topic.destinationZoneId !== result.destinationZoneId) return null;

  const zone = uniqueRecord(knowledge?.zones, result.destinationZoneId);
  const specialist = uniqueRecord(knowledge?.specialists, result.destinationNpcId);
  if (zone?.status !== 'approved' || specialist?.status !== 'approved' ||
      specialist.zoneId !== result.destinationZoneId ||
      !Array.isArray(specialist.topicIds) ||
      !specialist.topicIds.includes(result.topicId)) {
    return null;
  }

  return Object.freeze({
    destinationNpcId: specialist.id,
    destinationZoneId: zone.id,
    directions: nonEmptyString(specialist.directions) ? specialist.directions.trim() : null,
    expertise: nonEmptyString(specialist.expertise) ? specialist.expertise.trim() : null
  });
}

function deterministicSupportedResult(result, route) {
  if (!route) return { ...result };

  return {
    type: 'route',
    topicId: result.topicId,
    response: result.response,
    destinationNpcId: route.destinationNpcId,
    destinationZoneId: route.destinationZoneId,
    directions: route.directions,
    score: result.score
  };
}

function modelSupportedResult(result, answerText, route) {
  if (!route) {
    return {
      type: 'answer',
      topicId: result.topicId,
      response: answerText,
      score: result.score
    };
  }

  return {
    type: 'route',
    topicId: result.topicId,
    response: answerText,
    destinationNpcId: route.destinationNpcId,
    destinationZoneId: route.destinationZoneId,
    directions: route.directions,
    score: result.score
  };
}

function generateWithTimeout(generateResponse, request, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Model generation timed out.')), timeoutMs);
  });

  return Promise.race([
    Promise.resolve().then(() => generateResponse(request)),
    timeout
  ]).finally(() => clearTimeout(timer));
}

/**
 * Build the only data sent to a model callback: the visitor question, one
 * verified topic, its approved facts, allowed fact IDs, and limited context.
 * Returns null when the topic has no usable approved facts.
 */
export function createModelRequest(question, topic, context = {}, options = {}) {
  try {
    const settings = safeOptions(options);
    const maxQuestionLength = positiveInteger(
      settings.maxQuestionLength,
      DEFAULT_OPTIONS.maxQuestionLength
    );
    const maxContextValueLength = positiveInteger(
      settings.maxContextValueLength,
      DEFAULT_OPTIONS.maxContextValueLength
    );
    if (!nonEmptyString(question) ||
        question.trim().length > maxQuestionLength ||
        !isRecord(topic) ||
        !nonEmptyString(topic.id)) {
      return null;
    }

    const facts = approvedFactsForTopic(topic);
    if (!facts) return null;
    const contextSubset = limitedContext(context, maxContextValueLength);
    if (!contextSubset) return null;

    return Object.freeze({
      visitorQuestion: question.trim(),
      topicId: topic.id.trim(),
      facts,
      allowedFactIds: Object.freeze(facts.map((fact) => fact.id)),
      context: contextSubset
    });
  } catch {
    return null;
  }
}

/**
 * Validate the simulated model's structured output. Fact-ID validation limits
 * the declared grounding set, but it cannot prove that free-form prose is true.
 */
export function validateModelResponse(output, expectedTopicId, allowedFactIds, options = {}) {
  try {
    const settings = safeOptions(options);
    const maxAnswerLength = positiveInteger(
      settings.maxAnswerLength,
      DEFAULT_OPTIONS.maxAnswerLength
    );

    if (!isRecord(output)) return { valid: false, reason: 'Output must be an object.' };

    const fields = Object.keys(output).sort();
    if (fields.length !== MODEL_RESPONSE_FIELDS.length ||
        fields.some((field, index) => field !== MODEL_RESPONSE_FIELDS[index])) {
      return { valid: false, reason: 'Output fields do not match the required schema.' };
    }

    if (output.supported !== true) {
      return { valid: false, reason: 'The model did not confirm a supported answer.' };
    }
    if (!nonEmptyString(expectedTopicId) || output.topicId !== expectedTopicId) {
      return { valid: false, reason: 'The model topic does not match the canonical topic.' };
    }
    if (!nonEmptyString(output.answerText) || output.answerText.trim().length > maxAnswerLength) {
      return { valid: false, reason: 'The model answer is empty or too long.' };
    }
    if (!Array.isArray(allowedFactIds) || !Array.isArray(output.usedFactIds) ||
        output.usedFactIds.length === 0) {
      return { valid: false, reason: 'The model must declare at least one used fact.' };
    }

    const allowed = new Set();
    for (const factId of allowedFactIds) {
      if (!nonEmptyString(factId) || allowed.has(factId)) {
        return { valid: false, reason: 'The allowed fact set is malformed or duplicated.' };
      }
      allowed.add(factId);
    }

    const used = new Set();
    for (const factId of output.usedFactIds) {
      if (!nonEmptyString(factId) || !allowed.has(factId) || used.has(factId)) {
        return { valid: false, reason: 'The model referenced an unknown or duplicate fact.' };
      }
      used.add(factId);
    }

    return {
      valid: true,
      value: Object.freeze({
        supported: true,
        topicId: output.topicId,
        answerText: output.answerText.trim(),
        usedFactIds: Object.freeze([...output.usedFactIds])
      })
    };
  } catch {
    return { valid: false, reason: 'Output could not be validated safely.' };
  }
}

/**
 * Coordinate a deterministic resolver, approved knowledge, and an injected
 * model callback. Returns a Promise of { result, state }. The resolver may
 * return either a Stage 2 result or a Stage 3 { result, state } envelope.
 */
export async function orchestrateGuideQuestion(question, knowledge, context, options = {}) {
  const settings = safeOptions(options);
  const state = isRecord(context) ? context : {};
  const safeFallback = fallbackResult(fallbackResponse(settings));
  const resolver = typeof settings.resolveQuestion === 'function'
    ? settings.resolveQuestion
    : null;
  const maxQuestionLength = positiveInteger(
    settings.maxQuestionLength,
    DEFAULT_OPTIONS.maxQuestionLength
  );
  const maxContextValueLength = positiveInteger(
    settings.maxContextValueLength,
    DEFAULT_OPTIONS.maxContextValueLength
  );
  let hasValidContext;
  try {
    hasValidContext = Boolean(limitedContext(state, maxContextValueLength));
  } catch {
    return createOutcome(safeFallback, state);
  }

  if (!nonEmptyString(question) ||
      question.trim().length > maxQuestionLength ||
      !hasValidContext ||
      !resolver) {
    return createOutcome(safeFallback, state);
  }

  let resolution;
  try {
    resolution = await resolver(
      question,
      knowledge,
      state,
      isRecord(settings.resolverOptions) ? settings.resolverOptions : {}
    );
  } catch {
    return createOutcome(safeFallback, state);
  }

  let normalized;
  let deterministic;
  try {
    normalized = normalizeResolution(resolution, state);
    deterministic = normalizeDeterministicResult(normalized.result);
  } catch {
    return createOutcome(safeFallback, state);
  }
  if (!deterministic) return createOutcome(safeFallback, normalized.state);

  if (deterministic.type === 'fallback' || deterministic.type === 'clarify') {
    return createOutcome(deterministic, normalized.state);
  }

  let request;
  let route;
  const isContextualSpecialistAnswer = deterministic.type === 'answer' &&
    nonEmptyString(deterministic.destinationNpcId) &&
    nonEmptyString(deterministic.destinationZoneId);
  try {
    const topic = verifiedTopic(knowledge, deterministic.topicId);
    if (!topic || (!isContextualSpecialistAnswer &&
        (topic.type !== deterministic.type || topic.response.trim() !== deterministic.response))) {
      return createOutcome(safeFallback, normalized.state);
    }
    route = deterministic.type === 'route' || isContextualSpecialistAnswer
      ? canonicalRoute(knowledge, topic, deterministic)
      : null;
    if (isContextualSpecialistAnswer && (!route ||
        (deterministic.response !== route.directions && deterministic.response !== route.expertise))) {
      return createOutcome(safeFallback, normalized.state);
    }
    request = createModelRequest(question, topic, normalized.state, settings);
  } catch {
    return createOutcome(safeFallback, normalized.state);
  }
  if ((deterministic.type === 'route' || isContextualSpecialistAnswer) && !route) {
    return createOutcome(safeFallback, normalized.state);
  }

  // Stage 3 uses an answer with canonical destination IDs for directions and
  // expertise follow-ups. Keep that approved response deterministic because
  // the topic fact set does not necessarily contain either specialist field.
  if (isContextualSpecialistAnswer) {
    return createOutcome(deterministic, normalized.state);
  }

  const deterministicResult = deterministicSupportedResult(deterministic, route);
  const generateResponse = typeof settings.generateResponse === 'function'
    ? settings.generateResponse
    : null;
  // Model facts are an additional requirement for generation, not for an
  // already verified deterministic response from the matcher/memory modules.
  if (!generateResponse || !request) return createOutcome(deterministicResult, normalized.state);

  let generated;
  try {
    generated = await generateWithTimeout(
      generateResponse,
      request,
      positiveInteger(settings.modelTimeoutMs, DEFAULT_OPTIONS.modelTimeoutMs)
    );
  } catch {
    return createOutcome(deterministicResult, normalized.state);
  }

  const validation = validateModelResponse(
    generated,
    deterministic.topicId,
    request.allowedFactIds,
    { maxAnswerLength: settings.maxAnswerLength }
  );
  if (!validation.valid) return createOutcome(deterministicResult, normalized.state);

  return createOutcome(
    modelSupportedResult(deterministic, validation.value.answerText, route),
    normalized.state
  );
}
