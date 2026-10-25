import { normalizeQuestion } from './guide-qa.js';
import { validateGuideKnowledge } from './guide-knowledge-schema.js';

const DEFAULT_OPTIONS = Object.freeze({
  maximumQuestionLength: 300,
  maximumResults: 4,
  minimumScore: 2,
  ambiguityMargin: 0
});

const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'i', 'in',
  'is', 'it', 'me', 'of', 'on', 'please', 'tell', 'that', 'the', 'their', 'them',
  'they', 'this', 'to', 'what', 'where', 'which', 'who', 'why', 'with', 'fictional'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function configuredInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function configuredNumber(value, fallback, minimum) {
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

function terms(value) {
  const normalized = normalizeQuestion(value);
  if (!normalized) return [];
  return [...new Set(normalized.split(' ').filter((term) => (
    term.length >= 2 && !STOP_WORDS.has(term)
  )))];
}

function indexById(records) {
  return new Map(records.map((record) => [record.id, record]));
}

function immutableResult(result) {
  return Object.freeze({
    ...result,
    results: Object.freeze((result.results ?? []).map((entry) => Object.freeze({ ...entry })))
  });
}

function unsupported(knowledgeVersion, outcome, reason) {
  return immutableResult({
    outcome,
    reason,
    knowledgeVersion,
    topicId: null,
    results: []
  });
}

function validateApprovedKnowledge(knowledge) {
  const validation = validateGuideKnowledge(knowledge);
  if (!validation.valid) throw new TypeError('Approved retrieval knowledge is invalid.');
  for (const collection of ['sources', 'topics', 'facts', 'specialists', 'zones']) {
    if (knowledge[collection].some((record) => record.status !== 'approved')) {
      throw new TypeError('Retrieval accepts approved records only.');
    }
  }
}

function createEntries(knowledge) {
  const sources = indexById(knowledge.sources);
  const topics = indexById(knowledge.topics);
  const entries = [];

  for (const fact of knowledge.facts) {
    const topic = topics.get(fact.topicId);
    const source = sources.get(fact.sourceId);
    if (!topic || !source || !topic.factIds.includes(fact.id)) {
      throw new TypeError('Approved retrieval references are inconsistent.');
    }
    const topicTerms = terms(`${topic.label} ${topic.id.replaceAll('-', ' ')}`);
    const contentTerms = terms(fact.content);
    const sourceTerms = terms(`${source.title} ${fact.sourceLocation ?? ''}`);
    entries.push(Object.freeze({
      factId: fact.id,
      sourceId: source.id,
      topicId: topic.id,
      sourceLocation: fact.sourceLocation,
      content: fact.content,
      topicTerms: Object.freeze(topicTerms),
      contentTerms: Object.freeze(contentTerms),
      sourceTerms: Object.freeze(sourceTerms)
    }));
  }
  return Object.freeze(entries);
}

function scoreEntry(entry, questionTerms) {
  const query = new Set(questionTerms);
  const topicScore = entry.topicTerms.reduce(
    (score, term) => score + (query.has(term) ? 3 : 0),
    0
  );
  const contentScore = entry.contentTerms.reduce(
    (score, term) => score + (query.has(term) ? 1 : 0),
    0
  );
  const sourceScore = entry.sourceTerms.reduce(
    (score, term) => score + (query.has(term) ? 0.5 : 0),
    0
  );
  return Object.freeze({
    total: topicScore + contentScore + sourceScore,
    topic: topicScore
  });
}

/**
 * Build a provider-neutral, deterministic index over approved facts only.
 * Draft, in-review, and retired data must already have been filtered out.
 */
export function createApprovedKnowledgeRetriever(approvedKnowledge, options = {}) {
  validateApprovedKnowledge(approvedKnowledge);
  const settings = Object.freeze({
    maximumQuestionLength: configuredInteger(
      options.maximumQuestionLength,
      DEFAULT_OPTIONS.maximumQuestionLength,
      1,
      1000
    ),
    maximumResults: configuredInteger(
      options.maximumResults,
      DEFAULT_OPTIONS.maximumResults,
      1,
      10
    ),
    minimumScore: configuredNumber(options.minimumScore, DEFAULT_OPTIONS.minimumScore, 0.5),
    ambiguityMargin: configuredNumber(
      options.ambiguityMargin,
      DEFAULT_OPTIONS.ambiguityMargin,
      0
    )
  });
  const entries = createEntries(approvedKnowledge);

  return Object.freeze({
    knowledgeVersion: approvedKnowledge.knowledgeVersion,

    search(question, searchOptions = {}) {
      if (typeof question !== 'string' || !question.trim() ||
          question.length > settings.maximumQuestionLength) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'invalid', 'malformed_question');
      }
      const questionTerms = terms(question);
      if (questionTerms.length === 0) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'unsupported', 'no_search_terms');
      }
      const limit = configuredInteger(
        searchOptions.limit,
        settings.maximumResults,
        1,
        settings.maximumResults
      );
      const scored = entries
        .map((entry) => {
          const score = scoreEntry(entry, questionTerms);
          return { entry, score: score.total, topicScore: score.topic };
        })
        .filter((item) => item.score >= settings.minimumScore)
        .sort((left, right) => (
          right.score - left.score ||
          left.entry.topicId.localeCompare(right.entry.topicId) ||
          left.entry.factId.localeCompare(right.entry.factId)
        ));
      if (scored.length === 0) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'unsupported', 'no_approved_match');
      }

      // If the visitor explicitly names terms from two topic labels equally,
      // passage wording must not arbitrarily break that topic-level tie.
      const explicitTopicScores = new Map();
      for (const item of scored) {
        explicitTopicScores.set(item.entry.topicId, Math.max(
          explicitTopicScores.get(item.entry.topicId) ?? 0,
          item.topicScore
        ));
      }
      const explicitTopics = [...explicitTopicScores.entries()]
        .filter(([, score]) => score > 0)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
      if (explicitTopics[1] &&
          explicitTopics[0][1] - explicitTopics[1][1] <= settings.ambiguityMargin) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'ambiguous', 'multiple_approved_topics');
      }

      const topicScores = new Map();
      for (const item of scored) {
        topicScores.set(item.entry.topicId, Math.max(
          topicScores.get(item.entry.topicId) ?? 0,
          item.score
        ));
      }
      const rankedTopics = [...topicScores.entries()].sort((left, right) => (
        right[1] - left[1] || left[0].localeCompare(right[0])
      ));
      if (rankedTopics[1] && rankedTopics[0][1] - rankedTopics[1][1] <= settings.ambiguityMargin) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'ambiguous', 'multiple_approved_topics');
      }

      const topicId = rankedTopics[0][0];
      const topicMatches = scored.filter((item) => item.entry.topicId === topicId);
      const bestFactScore = topicMatches[0].score;
      const relevanceFloor = Math.max(settings.minimumScore, bestFactScore - 1);
      const results = topicMatches
        .filter((item) => item.score >= relevanceFloor)
        .slice(0, limit)
        .map(({ entry, score }) => ({
          factId: entry.factId,
          sourceId: entry.sourceId,
          topicId: entry.topicId,
          sourceLocation: entry.sourceLocation,
          content: entry.content,
          score
        }));

      return immutableResult({
        outcome: 'matched',
        reason: null,
        knowledgeVersion: approvedKnowledge.knowledgeVersion,
        topicId,
        results
      });
    }
  });
}
