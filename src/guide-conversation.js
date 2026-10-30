const EMPTY_STATE = Object.freeze({
  lastTopicId: null,
  lastDestinationNpcId: null,
  lastDestinationZoneId: null
});

const TOUR_ZONES = new Set(['hallway', 'printing-room', 'project-studio']);

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

function verifiedTopic(knowledge, topicId) {
  const topic = uniqueRecord(knowledge?.topics, topicId);
  return topic?.status === 'verified' &&
    (topic.type === 'answer' || topic.type === 'route') &&
    nonEmptyString(topic.response) ? topic : null;
}

function approvedDestination(knowledge, topic, npcId, zoneId) {
  if (!topic || topic.type !== 'route' ||
      !validId(npcId) || !TOUR_ZONES.has(zoneId) ||
      topic.destinationNpcId !== npcId || topic.destinationZoneId !== zoneId) return null;

  const zone = uniqueRecord(knowledge?.zones, zoneId);
  const specialist = uniqueRecord(knowledge?.specialists, npcId);
  if (zone?.status !== 'approved' || specialist?.status !== 'approved' ||
      specialist.zoneId !== zoneId || !Array.isArray(specialist.topicIds) ||
      !specialist.topicIds.includes(topic.id)) return null;

  return specialist;
}

function validMatchedResult(result, type, knowledge) {
  if (!isRecord(result) || result.type !== type ||
      !Number.isFinite(result.score) || result.score < 0 ||
      !nonEmptyString(result.response)) return false;
  const topic = verifiedTopic(knowledge, result.topicId);
  return topic?.type === type && result.response.trim() === topic.response.trim() &&
    (type === 'route' ||
      (result.destinationNpcId === undefined && result.destinationZoneId === undefined));
}

function validatedState(state, knowledge) {
  const copied = copyState(state);
  const topic = verifiedTopic(knowledge, copied.lastTopicId);
  if (!topic) return createConversationState();
  if (topic.type === 'answer') {
    return copied.lastDestinationNpcId === null && copied.lastDestinationZoneId === null
      ? copied : createConversationState();
  }
  return approvedDestination(knowledge, topic,
    copied.lastDestinationNpcId, copied.lastDestinationZoneId)
    ? copied : createConversationState();
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
 * Knowledge must contain unique verified topics and approved zones/specialists;
 * route destinations must agree with the topic and specialist.topicIds.
 * Approval flags are supplied by curated knowledge, not inferred by this module.
 */
export function handleGuideQuestion(question, knowledge, state, options = {}) {
  const currentState = validatedState(state, knowledge);
  const settings = isRecord(options) ? options : {};
  const fallbackResponse = responseOption(settings, 'fallbackResponse', DEFAULT_RESPONSES.fallback);
  const matcher = typeof settings.matchQuestion === 'function' ? settings.matchQuestion : null;
  let matched = null;

  if (!normalizeFollowUp(question)) {
    return createResult(fallbackResult(fallbackResponse), currentState);
  }

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
  if (validMatchedResult(matched, 'answer', knowledge)) {
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

  if (validMatchedResult(matched, 'route', knowledge)) {
    const npcId = matched.destinationNpcId;
    const zoneId = matched.destinationZoneId;
    const specialist = approvedDestination(
      knowledge, verifiedTopic(knowledge, matched.topicId), npcId, zoneId
    );

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
      verifiedTopic(knowledge, currentState.lastTopicId),
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
      matched.topicId === null &&
      matched.destinationNpcId === undefined && matched.destinationZoneId === undefined &&
      Number.isFinite(matched.score) && matched.score >= 0 &&
      nonEmptyString(matched.response)) {
    return createResult(passThroughResult(matched), currentState);
  }

  return createResult(fallbackResult(fallbackResponse), currentState);
}
