const EMPTY_STATE = Object.freeze({
  lastTopicId: null,
  lastDestinationNpcId: null,
  lastDestinationZoneId: null
});

const DEFAULT_RESPONSES = Object.freeze({
  missingContext: 'Please ask about a specialist first so I know who you mean.',
  missingDirections: "I don't have verified directions for that specialist.",
  missingExpertise: "I don't have verified expertise information for that specialist.",
  fallback: "I don't have a verified answer for that question."
});

const DESTINATION_FOLLOW_UPS = new Set([
  'how do i get there',
  'where are they',
  'where can i find her',
  'where can i find him',
  'where can i find that',
  'where can i find them',
  'where is that',
  'where is the specialist'
]);

const EXPERTISE_FOLLOW_UPS = new Set([
  'what can she teach me',
  'what can he teach me',
  'what can they teach me',
  'what can she tell me',
  'what can he tell me',
  'what can they tell me',
  'what does she specialize in',
  'what does he specialize in',
  'what do they specialize in'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function responseOption(options, key, fallback) {
  return nonEmptyString(options?.[key]) ? options[key].trim() : fallback;
}

function normalizeFollowUp(question) {
  if (typeof question !== 'string') return '';

  return question
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function copyState(state) {
  if (!isRecord(state)) return createConversationState();

  return Object.freeze({
    lastTopicId: nonEmptyString(state.lastTopicId) ? state.lastTopicId.trim() : null,
    lastDestinationNpcId: nonEmptyString(state.lastDestinationNpcId)
      ? state.lastDestinationNpcId.trim()
      : null,
    lastDestinationZoneId: nonEmptyString(state.lastDestinationZoneId)
      ? state.lastDestinationZoneId.trim()
      : null
  });
}

function createResult(result, state) {
  return Object.freeze({
    result: Object.freeze(result),
    state
  });
}

function scoreOf(result) {
  return Number.isFinite(result?.score) ? result.score : 0;
}

function fallbackResult(response) {
  return {
    type: 'fallback',
    topicId: null,
    response,
    score: 0
  };
}

function clarificationResult(response) {
  return {
    type: 'clarify',
    topicId: null,
    response,
    score: 0
  };
}

function contextualAnswer(state, response) {
  return {
    type: 'answer',
    topicId: state.lastTopicId,
    response,
    destinationNpcId: state.lastDestinationNpcId,
    destinationZoneId: state.lastDestinationZoneId,
    score: 0
  };
}

function approvedDestination(knowledge, npcId, zoneId) {
  if (!nonEmptyString(npcId) || !nonEmptyString(zoneId)) return null;

  const normalizedNpcId = npcId.trim();
  const normalizedZoneId = zoneId.trim();

  const zones = Array.isArray(knowledge?.zones) ? knowledge.zones : [];
  const specialists = Array.isArray(knowledge?.specialists) ? knowledge.specialists : [];
  const zone = zones.find((entry) => (
    isRecord(entry) &&
    entry.status === 'approved' &&
    entry.id === normalizedZoneId
  ));

  if (!zone) return null;

  const specialist = specialists.find((entry) => (
    isRecord(entry) &&
    entry.status === 'approved' &&
    entry.id === normalizedNpcId &&
    entry.zoneId === normalizedZoneId
  ));

  return specialist ?? null;
}

function validMatchedResult(result, type) {
  return isRecord(result) &&
    result.type === type &&
    nonEmptyString(result.topicId) &&
    nonEmptyString(result.response);
}

function passThroughResult(result) {
  return {
    type: result.type,
    topicId: null,
    response: result.response.trim(),
    score: scoreOf(result)
  };
}

/**
 * Create a fresh, in-memory guide context. Visitor questions and transcripts
 * are intentionally not part of this state.
 */
export function createConversationState() {
  return Object.freeze({ ...EMPTY_STATE });
}

/**
 * End a conversation by returning a new empty state. Existing state objects
 * are never modified.
 */
export function clearConversationState() {
  return createConversationState();
}

/**
 * Recognize only the small set of follow-up questions the guide explicitly
 * supports. Arbitrary pronouns are not guessed.
 */
export function classifyFollowUp(question) {
  const normalized = normalizeFollowUp(question);
  if (DESTINATION_FOLLOW_UPS.has(normalized)) return 'destination';
  if (EXPERTISE_FOLLOW_UPS.has(normalized)) return 'expertise';
  return null;
}

/**
 * Process a visitor question using an injected Stage 2-compatible matcher.
 * Returns both the response result and a new immutable conversation state.
 */
export function handleGuideQuestion(question, knowledge, state, options = {}) {
  const currentState = copyState(state);
  const settings = isRecord(options) ? options : {};
  const fallbackResponse = responseOption(settings, 'fallbackResponse', DEFAULT_RESPONSES.fallback);
  const matcher = typeof settings.matchQuestion === 'function' ? settings.matchQuestion : null;
  let matched = null;

  if (matcher) {
    try {
      matched = matcher(
        question,
        Array.isArray(knowledge?.topics) ? knowledge.topics : [],
        isRecord(settings.matcherOptions) ? settings.matcherOptions : {}
      );
    } catch {
      matched = null;
    }
  }

  // A concrete new topic always wins over pronoun-based follow-up handling.
  if (validMatchedResult(matched, 'answer')) {
    const nextState = Object.freeze({
      lastTopicId: matched.topicId.trim(),
      lastDestinationNpcId: null,
      lastDestinationZoneId: null
    });

    return createResult({
      type: 'answer',
      topicId: matched.topicId.trim(),
      response: matched.response.trim(),
      score: scoreOf(matched)
    }, nextState);
  }

  if (validMatchedResult(matched, 'route')) {
    const npcId = matched.destinationNpcId;
    const zoneId = matched.destinationZoneId;
    const specialist = approvedDestination(knowledge, npcId, zoneId);

    if (!specialist) {
      return createResult(fallbackResult(fallbackResponse), currentState);
    }

    const nextState = Object.freeze({
      lastTopicId: matched.topicId.trim(),
      lastDestinationNpcId: npcId.trim(),
      lastDestinationZoneId: zoneId.trim()
    });

    return createResult({
      type: 'route',
      topicId: matched.topicId.trim(),
      response: matched.response.trim(),
      destinationNpcId: npcId.trim(),
      destinationZoneId: zoneId.trim(),
      score: scoreOf(matched)
    }, nextState);
  }

  const followUp = classifyFollowUp(question);
  if (followUp) {
    const specialist = approvedDestination(
      knowledge,
      currentState.lastDestinationNpcId,
      currentState.lastDestinationZoneId
    );

    if (!specialist || !currentState.lastTopicId) {
      const response = responseOption(
        settings,
        'missingContextResponse',
        DEFAULT_RESPONSES.missingContext
      );
      return createResult(clarificationResult(response), currentState);
    }

    if (followUp === 'destination') {
      const response = nonEmptyString(specialist.directions)
        ? specialist.directions.trim()
        : responseOption(settings, 'missingDirectionsResponse', DEFAULT_RESPONSES.missingDirections);
      const result = nonEmptyString(specialist.directions)
        ? contextualAnswer(currentState, response)
        : fallbackResult(response);
      return createResult(result, currentState);
    }

    const response = nonEmptyString(specialist.expertise)
      ? specialist.expertise.trim()
      : responseOption(settings, 'missingExpertiseResponse', DEFAULT_RESPONSES.missingExpertise);
    const result = nonEmptyString(specialist.expertise)
      ? contextualAnswer(currentState, response)
      : fallbackResult(response);
    return createResult(result, currentState);
  }

  if (isRecord(matched) &&
      (matched.type === 'clarify' || matched.type === 'fallback') &&
      nonEmptyString(matched.response)) {
    return createResult(passThroughResult(matched), currentState);
  }

  return createResult(fallbackResult(fallbackResponse), currentState);
}
