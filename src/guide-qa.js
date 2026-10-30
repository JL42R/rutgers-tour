const DEFAULT_OPTIONS = Object.freeze({
  minimumScore: 2,
  ambiguityMargin: 1,
  phraseWeight: 3,
  keywordWeight: 1,
  fallbackResponse: "I don't have a verified answer for that question.",
  clarificationResponse: 'Could you clarify which topic you mean?'
});

/**
 * Convert a visitor question into lowercase, space-separated words so matching
 * is not affected by capitalization, punctuation, or repeated whitespace.
 */
export function normalizeQuestion(question) {
  if (typeof question !== 'string') return '';

  return question
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readOptions(options) {
  const source = options && typeof options === 'object' ? options : {};

  return {
    minimumScore: positiveNumber(source.minimumScore, DEFAULT_OPTIONS.minimumScore),
    ambiguityMargin: nonNegativeNumber(source.ambiguityMargin, DEFAULT_OPTIONS.ambiguityMargin),
    phraseWeight: positiveNumber(source.phraseWeight, DEFAULT_OPTIONS.phraseWeight),
    keywordWeight: positiveNumber(source.keywordWeight, DEFAULT_OPTIONS.keywordWeight),
    fallbackResponse: nonEmptyString(source.fallbackResponse)
      ? source.fallbackResponse.trim()
      : DEFAULT_OPTIONS.fallbackResponse,
    clarificationResponse: nonEmptyString(source.clarificationResponse)
      ? source.clarificationResponse.trim()
      : DEFAULT_OPTIONS.clarificationResponse
  };
}

function addTerms(terms, entries, defaultWeight) {
  if (!Array.isArray(entries)) return;

  for (const entry of entries) {
    const text = typeof entry === 'string' ? entry : entry?.text;
    const normalizedText = normalizeQuestion(text);
    if (!normalizedText) continue;

    const weight = typeof entry === 'string'
      ? defaultWeight
      : positiveNumber(entry?.weight, defaultWeight);

    // Repeated configuration should not increase a topic's score by accident.
    terms.set(normalizedText, Math.max(terms.get(normalizedText) ?? 0, weight));
  }
}

function readTopicTerms(topic, settings) {
  const terms = new Map();
  addTerms(terms, topic.phrases, settings.phraseWeight);
  addTerms(terms, topic.keywords, settings.keywordWeight);

  return [...terms.entries()].map(([text, weight]) => ({ text, weight }));
}

function containsWholeTerm(question, term) {
  return ` ${question} `.includes(` ${term} `);
}

function prepareTopic(topic, index, settings) {
  if (!topic || typeof topic !== 'object' || topic.status !== 'verified') return null;
  if (!nonEmptyString(topic.id) || !nonEmptyString(topic.response)) return null;
  if (topic.type !== 'answer' && topic.type !== 'route') return null;

  if (topic.type === 'route' &&
      (!nonEmptyString(topic.destinationNpcId) || !nonEmptyString(topic.destinationZoneId))) {
    return null;
  }

  return {
    index,
    topicId: topic.id.trim(),
    type: topic.type,
    response: topic.response.trim(),
    destinationNpcId: topic.type === 'route' ? topic.destinationNpcId.trim() : undefined,
    destinationZoneId: topic.type === 'route' ? topic.destinationZoneId.trim() : undefined,
    terms: readTopicTerms(topic, settings)
  };
}

function fallbackResult(response) {
  return {
    type: 'fallback',
    topicId: null,
    response,
    score: 0
  };
}

/**
 * Match a question against verified topic data. This function is deliberately
 * independent of the DOM, Three.js, network services, and persistent state.
 */
export function matchQuestion(question, topics, options = {}) {
  const normalizedQuestion = normalizeQuestion(question);
  const settings = readOptions(options);

  if (!normalizedQuestion || !Array.isArray(topics)) {
    return fallbackResult(settings.fallbackResponse);
  }

  const matches = topics
    .map((topic, index) => prepareTopic(topic, index, settings))
    .filter(Boolean)
    .map((topic) => ({
      ...topic,
      score: topic.terms.reduce(
        (total, term) => total + (containsWholeTerm(normalizedQuestion, term.text) ? term.weight : 0),
        0
      )
    }))
    .filter((topic) => topic.score >= settings.minimumScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.topicId !== b.topicId) return a.topicId < b.topicId ? -1 : 1;
      return a.index - b.index;
    });

  if (!matches.length) return fallbackResult(settings.fallbackResponse);

  const best = matches[0];
  const runnerUp = matches[1];
  if (runnerUp && best.score - runnerUp.score <= settings.ambiguityMargin) {
    return {
      type: 'clarify',
      topicId: null,
      response: settings.clarificationResponse,
      score: best.score
    };
  }

  const result = {
    type: best.type,
    topicId: best.topicId,
    response: best.response,
    score: best.score
  };

  if (best.type === 'route') {
    result.destinationNpcId = best.destinationNpcId;
    result.destinationZoneId = best.destinationZoneId;
  }

  return result;
}
