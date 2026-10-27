import { normalizeQuestion } from './guide-qa.js';
import { prepareGuideRetrievalProfile } from './guide-retrieval-profile.js';
import { validateGuideKnowledge } from './guide-knowledge-schema.js';

const DEFAULT_OPTIONS = Object.freeze({
  maximumQuestionLength: 300,
  maximumResults: 4,
  minimumScore: 2.5,
  ambiguityMargin: 1.5,
  minimumSpecificCoverage: 0.6,
  minimumAnswerabilityCoverage: 1
});

const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'could', 'do', 'does',
  'explain', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'me', 'of', 'on', 'please',
  'tell', 'that', 'the', 'their', 'them', 'they', 'this', 'to', 'what', 'when', 'where',
  'which', 'who', 'why', 'with', 'you', 'your', 'fictional'
]);

const GENERIC_QUERY_WORDS = new Set([
  'after', 'all', 'among', 'any', 'away', 'details', 'display', 'during', 'growing', 'instead',
  'approved', 'both', 'claim', 'correct', 'helps', 'inside', 'know', 'many', 'its',
  'long', 'makes', 'need', 'only',
  'passage', 'passages', 'picnic', 'purpose', 'serve', 'serves', 'skip', 'someone',
  'support', 'talk', 'thing', 'those', 'travel', 'unrelated', 'use', 'used', 'visitor',
  'visitors', 'want', 'whether'
]);

const MORPHOLOGY = new Map([
  ['anchors', 'anchor'], ['bends', 'bend'], ['bent', 'bend'], ['bridges', 'bridge'],
  ['cast', 'cast'], ['colors', 'color'], ['colored', 'color'], ['creases', 'crease'],
  ['arranged', 'arrange'], ['arranges', 'arrange'], ['creates', 'create'],
  ['crossings', 'crossing'], ['devices', 'device'], ['distributes', 'distribute'],
  ['folds', 'fold'], ['forms', 'form'], ['fountains', 'fountain'], ['gardens', 'garden'],
  ['gusts', 'gust'], ['hinges', 'hinge'], ['joints', 'joint'], ['keeps', 'keep'],
  ['kites', 'kite'], ['leaves', 'leaf'], ['loops', 'loop'], ['machines', 'machine'],
  ['makes', 'make'], ['markers', 'marker'], ['moves', 'move'], ['moving', 'move'],
  ['orchards', 'orchard'],
  ['patterns', 'pattern'], ['plants', 'plant'], ['pools', 'pool'], ['powers', 'power'],
  ['pulls', 'pull'], ['ribs', 'rib'],
  ['repeats', 'repeat'], ['rods', 'rod'], ['rotated', 'rotate'], ['rotates', 'rotate'],
  ['rotational', 'rotate'], ['sails', 'sail'], ['seconds', 'second'], ['spans', 'span'],
  ['needed', 'need'], ['secures', 'secure'], ['stars', 'star'], ['tabs', 'tab'], ['tokens', 'token'],
  ['turning', 'turn'], ['turns', 'turn'],
  ['watts', 'watt'], ['wells', 'well']
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function configuredInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function configuredNumber(value, fallback, minimum, maximum = Number.POSITIVE_INFINITY) {
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

function normalizedToken(token) {
  return MORPHOLOGY.get(token) ?? token;
}

function tokens(value, { includeStopWords = false } = {}) {
  const normalized = normalizeQuestion(value);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map(normalizedToken)
    .filter((term) => term.length >= 2 && (includeStopWords || !STOP_WORDS.has(term)));
}

function uniqueTerms(value) {
  return Object.freeze([...new Set(tokens(value))]);
}

function normalizedPhrase(value) {
  return tokens(value, { includeStopWords: true }).join(' ');
}

function focusedQuestion(value) {
  const normalized = normalizeQuestion(value);
  const markers = ['please explain ', 'i only want to know ', 'explain whether '];
  let focused = normalized;
  for (const marker of markers) {
    const position = focused.lastIndexOf(marker);
    if (position >= 0 && focused.slice(position + marker.length).trim()) {
      focused = focused.slice(position + marker.length).trim();
    }
  }
  return focused;
}

function containsPhrase(questionPhrase, phrase) {
  return Boolean(phrase) && ` ${questionPhrase} `.includes(` ${phrase} `);
}

function countTerms(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
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

function createEntries(knowledge, profile) {
  const sources = indexById(knowledge.sources);
  const topics = indexById(knowledge.topics);
  const entries = [];

  for (const fact of knowledge.facts) {
    const topic = topics.get(fact.topicId);
    const source = sources.get(fact.sourceId);
    const binding = profile.bindingForFact(fact.id);
    if (!topic || !source || !topic.factIds.includes(fact.id) || !binding ||
        binding.sourceId !== fact.sourceId || binding.sourceLocation !== fact.sourceLocation) {
      throw new TypeError('Approved retrieval references are inconsistent.');
    }
    const topicPhrases = [
      normalizedPhrase(topic.label),
      normalizedPhrase(topic.id.replaceAll('-', ' ')),
      ...profile.aliasesForTopic(topic.id).map(normalizedPhrase)
    ].filter(Boolean);
    const factPhrases = profile.aliasesForFact(fact.id).map(normalizedPhrase).filter(Boolean);
    const answerabilityPhrases = profile.answerabilityPhrasesForFact(fact.id)
      .map(normalizedPhrase)
      .filter(Boolean);
    const contentTokens = tokens(fact.content);
    const sourceTokens = tokens(source.title);
    entries.push(Object.freeze({
      factId: fact.id,
      sourceId: source.id,
      topicId: topic.id,
      sourceLocation: binding.sourceLocation,
      content: fact.content,
      topicPhrases: Object.freeze([...new Set(topicPhrases)]),
      factPhrases: Object.freeze([...new Set(factPhrases)]),
      answerabilityPhrases: Object.freeze([...new Set(answerabilityPhrases)]),
      topicTerms: uniqueTerms(topicPhrases.join(' ')),
      factAliasTerms: uniqueTerms(factPhrases.join(' ')),
      answerabilityTerms: uniqueTerms(`${fact.content} ${answerabilityPhrases.join(' ')}`),
      contentTerms: Object.freeze(contentTokens),
      contentTermCounts: countTerms(contentTokens),
      sourceTerms: Object.freeze(sourceTokens),
      claim: profile.claimForFact(fact.id)
    }));
  }
  return Object.freeze(entries);
}

function inverseDocumentFrequency(entries) {
  const frequencies = new Map();
  for (const entry of entries) {
    const terms = new Set([...entry.contentTerms, ...entry.factAliasTerms]);
    for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }
  const count = entries.length;
  return (term) => {
    const frequency = frequencies.get(term) ?? 0;
    return Math.log(1 + ((count - frequency + 0.5) / (frequency + 0.5)));
  };
}

function bm25(entry, questionTerms, idf, averageLength) {
  const k1 = 1.2;
  const b = 0.75;
  const length = Math.max(1, entry.contentTerms.length);
  let score = 0;
  for (const term of questionTerms) {
    const frequency = entry.contentTermCounts.get(term) ?? 0;
    if (frequency === 0) continue;
    const numerator = frequency * (k1 + 1);
    const denominator = frequency + k1 * (1 - b + b * (length / averageLength));
    score += idf(term) * (numerator / denominator);
  }
  return score;
}

function scoreEntry(entry, query, idf, averageLength, hasReviewedProfile) {
  const querySet = new Set(query.terms);
  const contentScore = bm25(entry, query.terms, idf, averageLength);
  const topicTokenScore = entry.topicTerms.reduce(
    (score, term) => score + (querySet.has(term) ? (hasReviewedProfile ? idf(term) * 0.85 : 3) : 0),
    0
  );
  const aliasTokenScore = entry.factAliasTerms.reduce(
    (score, term) => score + (querySet.has(term) ? idf(term) * 1.25 : 0),
    0
  );
  const sourceScore = entry.sourceTerms.reduce(
    (score, term) => score + (querySet.has(term) ? idf(term) * 0.15 : 0),
    0
  );
  const topicPhraseMatches = entry.topicPhrases.filter((phrase) => containsPhrase(query.phrase, phrase));
  const factPhraseMatches = entry.factPhrases.filter((phrase) => containsPhrase(query.phrase, phrase));
  const answerabilityPhraseMatches = entry.answerabilityPhrases.filter(
    (phrase) => containsPhrase(query.phrase, phrase)
  );
  const phraseScore = topicPhraseMatches.length * 4 + factPhraseMatches.length * 6;
  return Object.freeze({
    total: contentScore + topicTokenScore + aliasTokenScore + sourceScore + phraseScore,
    contentScore,
    topicPhraseMatches: Object.freeze(topicPhraseMatches),
    factPhraseMatches: Object.freeze(factPhraseMatches),
    answerabilityPhraseMatches: Object.freeze(answerabilityPhraseMatches)
  });
}

function topicEvidence(scored, query) {
  const grouped = new Map();
  for (const item of scored) {
    const current = grouped.get(item.entry.topicId) ?? {
      topicId: item.entry.topicId,
      score: 0,
      entries: [],
      topicTerms: new Set(),
      evidenceTerms: new Set(),
      exactTopicPhrase: false,
      exactFactPhrase: false,
      mentionedTopicTerms: new Set()
    };
    current.score = Math.max(current.score, item.score);
    current.entries.push(item);
    for (const term of item.entry.topicTerms) current.topicTerms.add(term);
    for (const term of item.entry.contentTerms) current.evidenceTerms.add(term);
    for (const term of item.entry.factAliasTerms) current.evidenceTerms.add(term);
    for (const term of item.entry.answerabilityTerms) current.evidenceTerms.add(term);
    current.exactTopicPhrase ||= item.detail.topicPhraseMatches.length > 0;
    current.exactFactPhrase ||= item.detail.factPhraseMatches.length > 0;
    grouped.set(item.entry.topicId, current);
  }

  return [...grouped.values()].map((topic) => {
    const specificTerms = query.terms.filter((term) => (
      !topic.topicTerms.has(term) && !GENERIC_QUERY_WORDS.has(term)
    ));
    const matchedSpecific = specificTerms.filter((term) => topic.evidenceTerms.has(term));
    for (const term of query.terms) {
      if (topic.topicTerms.has(term)) topic.mentionedTopicTerms.add(term);
    }
    return {
      ...topic,
      specificTerms,
      matchedSpecific,
      coverage: specificTerms.length === 0 ? 1 : matchedSpecific.length / specificTerms.length
    };
  }).sort((left, right) => right.score - left.score || left.topicId.localeCompare(right.topicId));
}

function hasRouteIntent(normalizedQuestion) {
  return /\b(where|find|located|location|directions|get there)\b/.test(normalizedQuestion);
}

function topicHasRoute(topicId, knowledge) {
  const topic = knowledge.topics.find((record) => record.id === topicId);
  return Boolean(topic?.specialistIds?.length && topic?.destinationZoneIds?.length);
}

function supportedEvidence(topic, settings) {
  if (topic.exactFactPhrase) return true;
  if (!settings.hasReviewedProfile && topic.exactTopicPhrase) return true;
  if (topic.specificTerms.length === 0 && topic.exactTopicPhrase) return true;
  return topic.matchedSpecific.length > 0 && topic.coverage >= settings.minimumSpecificCoverage;
}

function answerableTopicEntries(topic, query, settings) {
  if (!settings.hasReviewedProfile) return topic.entries;
  const specificTerms = query.terms.filter((term) => (
    !topic.topicTerms.has(term) && !GENERIC_QUERY_WORDS.has(term)
  ));
  if (specificTerms.length === 0) {
    return topic.exactTopicPhrase ? topic.entries : [];
  }
  return topic.entries.filter((item) => {
    const evidence = new Set(item.entry.answerabilityTerms);
    if (item.entry.claim) {
      for (const factId of item.entry.claim.factIds) {
        const companion = topic.entries.find((candidate) => candidate.entry.factId === factId);
        for (const term of companion?.entry.answerabilityTerms ?? []) evidence.add(term);
      }
    }
    const matched = specificTerms.filter((term) => evidence.has(term));
    return matched.length > 0 &&
      matched.length / specificTerms.length >= settings.minimumAnswerabilityCoverage;
  });
}

function competingTopicEvidence(best, runner, settings) {
  if (!runner || best.exactFactPhrase && !runner.exactFactPhrase) return false;
  if (!settings.hasReviewedProfile && best.mentionedTopicTerms.size > 0 &&
      runner.mentionedTopicTerms.size > 0) return true;
  if (best.exactTopicPhrase && !runner.exactTopicPhrase) return false;
  if (best.exactTopicPhrase && runner.exactTopicPhrase) return true;
  const close = best.score - runner.score <= settings.ambiguityMargin;
  if (close && supportedEvidence(best, settings) && supportedEvidence(runner, settings)) return true;

  const bestSignals = new Set([...best.mentionedTopicTerms, ...best.matchedSpecific]);
  const runnerSignals = new Set([...runner.mentionedTopicTerms, ...runner.matchedSpecific]);
  const bestUnique = [...bestSignals].some((term) => !runnerSignals.has(term));
  const runnerUnique = [...runnerSignals].some((term) => !bestSignals.has(term));
  const relevantTerms = new Set([
    ...best.specificTerms,
    ...best.mentionedTopicTerms,
    ...runner.specificTerms,
    ...runner.mentionedTopicTerms
  ]);
  const combinedSignals = new Set([...bestSignals, ...runnerSignals]);
  const combinedCoverage = [...relevantTerms].every((term) => combinedSignals.has(term));
  return bestUnique && runnerUnique && combinedCoverage && runner.score >= best.score * 0.2;
}

function selectedResults(topic, settings, limit, eligibleEntries = topic.entries) {
  const bestScore = eligibleEntries[0]?.score ?? 0;
  const relevanceFloor = Math.max(settings.minimumScore, bestScore - 2.25);
  const selected = eligibleEntries.filter((item) => item.score >= relevanceFloor);
  if (topic.specificTerms.length === 0 && topic.exactTopicPhrase && !topic.exactFactPhrase) {
    selected.splice(0, selected.length, ...eligibleEntries);
  }

  const selectedIds = new Set(selected.map((item) => item.entry.factId));
  for (const item of [...selected]) {
    if (item.entry.claim?.resolution !== 'reinforcing') continue;
    for (const factId of item.entry.claim.factIds) {
      if (selectedIds.has(factId)) continue;
      const companion = topic.entries.find((candidate) => candidate.entry.factId === factId);
      if (companion) {
        selected.push(companion);
        selectedIds.add(factId);
      }
    }
  }

  return selected
    .sort((left, right) => right.score - left.score || left.entry.factId.localeCompare(right.entry.factId))
    .slice(0, limit);
}

/**
 * Build a provider-neutral, deterministic index over approved facts only.
 * Optional retrieval metadata is separately reviewed and version-bound.
 */
export function createApprovedKnowledgeRetriever(approvedKnowledge, options = {}) {
  validateApprovedKnowledge(approvedKnowledge);
  const profile = prepareGuideRetrievalProfile(approvedKnowledge, options.retrievalProfile);
  const settings = Object.freeze({
    hasReviewedProfile: profile.profileVersion !== null,
    maximumQuestionLength: configuredInteger(options.maximumQuestionLength, DEFAULT_OPTIONS.maximumQuestionLength, 1, 1000),
    maximumResults: configuredInteger(options.maximumResults, DEFAULT_OPTIONS.maximumResults, 1, 10),
    minimumScore: configuredNumber(
      options.minimumScore,
      profile.profileVersion === null ? 2 : DEFAULT_OPTIONS.minimumScore,
      0.5
    ),
    ambiguityMargin: configuredNumber(options.ambiguityMargin, DEFAULT_OPTIONS.ambiguityMargin, 0, 20),
    minimumSpecificCoverage: configuredNumber(
      options.minimumSpecificCoverage,
      DEFAULT_OPTIONS.minimumSpecificCoverage,
      0,
      1
    ),
    minimumAnswerabilityCoverage: configuredNumber(
      options.minimumAnswerabilityCoverage,
      DEFAULT_OPTIONS.minimumAnswerabilityCoverage,
      0.5,
      1
    )
  });
  const entries = createEntries(approvedKnowledge, profile);
  const idf = inverseDocumentFrequency(entries);
  const averageLength = entries.reduce((total, entry) => total + entry.contentTerms.length, 0) /
    Math.max(1, entries.length);

  return Object.freeze({
    knowledgeVersion: approvedKnowledge.knowledgeVersion,
    profileVersion: profile.profileVersion,

    search(question, searchOptions = {}) {
      if (typeof question !== 'string' || !question.trim() ||
          question.length > settings.maximumQuestionLength) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'invalid', 'malformed_question');
      }
      const normalized = normalizeQuestion(question);
      const excluded = profile.excludedMatch(normalized);
      if (excluded) {
        return unsupported(
          approvedKnowledge.knowledgeVersion,
          'unsupported',
          `${excluded.lifecycleStatus}_evidence_excluded`
        );
      }
      if (profile.ambiguityMatch(normalized)) {
        return unsupported(
          approvedKnowledge.knowledgeVersion,
          'ambiguous',
          'reviewed_ambiguous_terminology'
        );
      }
      const focused = focusedQuestion(question);
      const query = Object.freeze({
        phrase: normalizedPhrase(focused),
        terms: Object.freeze([...new Set(tokens(focused))])
      });
      if (query.terms.length === 0) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'unsupported', 'no_search_terms');
      }
      const limit = configuredInteger(searchOptions.limit, settings.maximumResults, 1, settings.maximumResults);
      const scored = entries
        .map((entry) => {
          const detail = scoreEntry(entry, query, idf, averageLength, settings.hasReviewedProfile);
          return { entry, score: detail.total, detail };
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

      const rankedTopics = topicEvidence(scored, query);
      const best = rankedTopics[0];
      const runnerUp = rankedTopics[1];
      if (competingTopicEvidence(best, runnerUp, settings)) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'ambiguous', 'multiple_approved_topics');
      }
      if (!supportedEvidence(best, settings)) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'unsupported', 'insufficient_specific_evidence');
      }
      if (hasRouteIntent(normalized) && !topicHasRoute(best.topicId, approvedKnowledge)) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'unsupported', 'no_approved_route');
      }

      const answerableEntries = answerableTopicEntries(best, query, settings);
      if (answerableEntries.length === 0) {
        return unsupported(
          approvedKnowledge.knowledgeVersion,
          'unsupported',
          'insufficient_answerability'
        );
      }
      const selected = selectedResults(best, settings, limit, answerableEntries);
      if (selected.some((item) => item.entry.claim?.resolution === 'unresolved_conflict')) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'conflict', 'unresolved_approved_conflict');
      }
      const results = selected.map(({ entry, score }) => ({
        factId: entry.factId,
        sourceId: entry.sourceId,
        topicId: entry.topicId,
        sourceLocation: entry.sourceLocation,
        content: entry.content,
        score: Number(score.toFixed(6))
      }));
      if (results.length === 0) {
        return unsupported(approvedKnowledge.knowledgeVersion, 'unsupported', 'no_relevant_passage');
      }

      return immutableResult({
        outcome: 'matched',
        reason: null,
        knowledgeVersion: approvedKnowledge.knowledgeVersion,
        topicId: best.topicId,
        results
      });
    }
  });
}
