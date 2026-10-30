import { normalizeQuestion } from './guide-qa.js';

const PROFILE_FIELDS = Object.freeze([
  'schemaVersion',
  'profileVersion',
  'knowledgeVersion',
  'contentClassification',
  'approval',
  'topicAliases',
  'factAliases',
  'answerabilityPhrases',
  'propertyDefinitions',
  'factProperties',
  'excludedPhrases',
  'ambiguityRules',
  'sourceBindings',
  'claimGroups'
]);
const APPROVAL_FIELDS = Object.freeze(['reviewedBy', 'reference', 'reviewedAt']);
const ALIAS_FIELDS = Object.freeze(['topicId', 'phrases']);
const FACT_ALIAS_FIELDS = Object.freeze(['factId', 'phrases']);
const PROPERTY_FIELDS = Object.freeze(['id', 'phrases']);
const FACT_PROPERTY_FIELDS = Object.freeze(['factId', 'propertyIds']);
const EXCLUDED_FIELDS = Object.freeze(['phrase', 'lifecycleStatus']);
const AMBIGUITY_FIELDS = Object.freeze(['phrase', 'topicIds']);
const BINDING_FIELDS = Object.freeze(['factId', 'sourceId', 'sourceLocation']);
const CLAIM_FIELDS = Object.freeze(['id', 'factIds', 'resolution']);
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, fields, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new TypeError(`${label} fields are invalid.`);
  }
}

function boundedString(value, label, maximum = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value.trim();
}

function identifier(value, label) {
  const selected = boundedString(value, label, 64);
  if (!IDENTIFIER_PATTERN.test(selected)) throw new TypeError(`${label} is invalid.`);
  return selected;
}

function exactArray(value, label, minimum = 0, maximum = 100) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
}

function normalizedPhrases(value, label) {
  const phrases = exactArray(value, label, 1, 20);
  const normalized = [];
  const seen = new Set();
  for (const phrase of phrases) {
    const selected = normalizeQuestion(boundedString(phrase, label, 120));
    if (!selected || seen.has(selected)) throw new TypeError(`${label} contains an invalid phrase.`);
    seen.add(selected);
    normalized.push(selected);
  }
  return Object.freeze(normalized);
}

function approvedIndexes(knowledge) {
  if (!isRecord(knowledge) || !Array.isArray(knowledge.topics) ||
      !Array.isArray(knowledge.facts) || !Array.isArray(knowledge.sources)) {
    throw new TypeError('Approved knowledge is invalid for a retrieval profile.');
  }
  const topics = new Map(knowledge.topics.map((record) => [record.id, record]));
  const facts = new Map(knowledge.facts.map((record) => [record.id, record]));
  const sources = new Map(knowledge.sources.map((record) => [record.id, record]));
  if ([topics, facts, sources].some((index) => [...index.values()].some(
    (record) => record?.status !== 'approved'
  ))) {
    throw new TypeError('Retrieval profiles accept approved knowledge only.');
  }
  return { topics, facts, sources };
}

function readApproval(value) {
  exactFields(value, APPROVAL_FIELDS, 'retrievalProfile.approval');
  const reviewedAt = boundedString(value.reviewedAt, 'retrievalProfile.approval.reviewedAt', 10);
  if (!DATE_PATTERN.test(reviewedAt)) throw new TypeError('Retrieval profile review date is invalid.');
  return Object.freeze({
    reviewedBy: boundedString(value.reviewedBy, 'retrievalProfile.approval.reviewedBy', 128),
    reference: boundedString(value.reference, 'retrievalProfile.approval.reference', 256),
    reviewedAt
  });
}

function readAliases(entries, fields, idField, index, label) {
  const aliases = new Map();
  for (const [entryIndex, entry] of exactArray(entries, label, 0, 100).entries()) {
    exactFields(entry, fields, `${label}[${entryIndex}]`);
    const id = identifier(entry[idField], `${label}[${entryIndex}].${idField}`);
    if (!index.has(id) || aliases.has(id)) throw new TypeError(`${label} references an invalid ID.`);
    aliases.set(id, normalizedPhrases(entry.phrases, `${label}[${entryIndex}].phrases`));
  }
  return aliases;
}

function readExcluded(entries) {
  const excluded = [];
  const seen = new Set();
  for (const [index, entry] of exactArray(entries, 'retrievalProfile.excludedPhrases', 0, 50).entries()) {
    exactFields(entry, EXCLUDED_FIELDS, `retrievalProfile.excludedPhrases[${index}]`);
    const phrase = normalizeQuestion(boundedString(entry.phrase, 'excluded phrase', 120));
    if (!phrase || seen.has(phrase) || !['draft', 'in_review', 'retired'].includes(entry.lifecycleStatus)) {
      throw new TypeError('Retrieval profile excluded phrase is invalid.');
    }
    seen.add(phrase);
    excluded.push(Object.freeze({ phrase, lifecycleStatus: entry.lifecycleStatus }));
  }
  return Object.freeze(excluded);
}

function readProperties(definitionEntries, factEntries, facts) {
  const definitions = new Map();
  for (const [index, entry] of exactArray(
    definitionEntries,
    'retrievalProfile.propertyDefinitions',
    1,
    60
  ).entries()) {
    exactFields(entry, PROPERTY_FIELDS, `retrievalProfile.propertyDefinitions[${index}]`);
    const id = identifier(entry.id, 'property definition id');
    if (definitions.has(id)) throw new TypeError('Retrieval profile property definition is invalid.');
    definitions.set(id, normalizedPhrases(
      entry.phrases,
      `retrievalProfile.propertyDefinitions[${index}].phrases`
    ));
  }

  const propertiesByFact = new Map();
  for (const [index, entry] of exactArray(
    factEntries,
    'retrievalProfile.factProperties',
    facts.size,
    facts.size
  ).entries()) {
    exactFields(entry, FACT_PROPERTY_FIELDS, `retrievalProfile.factProperties[${index}]`);
    const factId = identifier(entry.factId, 'fact property factId');
    const propertyIds = exactArray(entry.propertyIds, 'fact property IDs', 1, 12)
      .map((propertyId) => identifier(propertyId, 'fact property ID'));
    if (!facts.has(factId) || propertiesByFact.has(factId) ||
        new Set(propertyIds).size !== propertyIds.length ||
        propertyIds.some((propertyId) => !definitions.has(propertyId))) {
      throw new TypeError('Retrieval profile fact properties are invalid.');
    }
    propertiesByFact.set(factId, Object.freeze(propertyIds));
  }
  if (propertiesByFact.size !== facts.size) {
    throw new TypeError('Every approved fact needs reviewed properties.');
  }
  return { definitions, propertiesByFact };
}

function readAmbiguityRules(entries, topics) {
  const rules = [];
  const seen = new Set();
  for (const [index, entry] of exactArray(entries, 'retrievalProfile.ambiguityRules', 0, 50).entries()) {
    exactFields(entry, AMBIGUITY_FIELDS, `retrievalProfile.ambiguityRules[${index}]`);
    const phrase = normalizeQuestion(boundedString(entry.phrase, 'ambiguity phrase', 120));
    const topicIds = exactArray(entry.topicIds, 'ambiguity topicIds', 2, 10)
      .map((topicId) => identifier(topicId, 'ambiguity topicId'));
    if (!phrase || seen.has(phrase) || new Set(topicIds).size !== topicIds.length ||
        topicIds.some((topicId) => !topics.has(topicId))) {
      throw new TypeError('Retrieval profile ambiguity rule is invalid.');
    }
    seen.add(phrase);
    rules.push(Object.freeze({ phrase, topicIds: Object.freeze(topicIds) }));
  }
  return Object.freeze(rules);
}

function readBindings(entries, facts, sources) {
  const bindings = new Map();
  for (const [index, entry] of exactArray(
    entries,
    'retrievalProfile.sourceBindings',
    facts.size,
    facts.size
  ).entries()) {
    exactFields(entry, BINDING_FIELDS, `retrievalProfile.sourceBindings[${index}]`);
    const factId = identifier(entry.factId, 'source binding factId');
    const sourceId = identifier(entry.sourceId, 'source binding sourceId');
    const sourceLocation = boundedString(entry.sourceLocation, 'source binding sourceLocation', 200);
    const fact = facts.get(factId);
    if (!fact || !sources.has(sourceId) || bindings.has(factId) ||
        fact.sourceId !== sourceId || fact.sourceLocation !== sourceLocation) {
      throw new TypeError('Retrieval profile source binding does not match approved knowledge.');
    }
    bindings.set(factId, Object.freeze({ factId, sourceId, sourceLocation }));
  }
  if (bindings.size !== facts.size) throw new TypeError('Every approved fact needs one source binding.');
  return bindings;
}

function readClaims(entries, facts) {
  const claimsByFact = new Map();
  const claims = [];
  const claimIds = new Set();
  for (const [index, entry] of exactArray(entries, 'retrievalProfile.claimGroups', 0, 50).entries()) {
    exactFields(entry, CLAIM_FIELDS, `retrievalProfile.claimGroups[${index}]`);
    const id = identifier(entry.id, 'claim group id');
    if (claimIds.has(id) || !['reinforcing', 'unresolved_conflict'].includes(entry.resolution)) {
      throw new TypeError('Retrieval profile claim group is invalid.');
    }
    claimIds.add(id);
    const factIds = exactArray(entry.factIds, 'claim group factIds', 2, 20)
      .map((factId) => identifier(factId, 'claim group factId'));
    const records = factIds.map((factId) => facts.get(factId));
    if (records.some((record) => !record) || new Set(factIds).size !== factIds.length ||
        new Set(records.map((record) => record.topicId)).size !== 1 ||
        factIds.some((factId) => claimsByFact.has(factId))) {
      throw new TypeError('Retrieval profile claim group references are invalid.');
    }
    const claim = Object.freeze({ id, factIds: Object.freeze(factIds), resolution: entry.resolution });
    claims.push(claim);
    for (const factId of factIds) claimsByFact.set(factId, claim);
  }
  return { claims: Object.freeze(claims), claimsByFact };
}

/**
 * Validate reviewed retrieval metadata separately from untrusted document text.
 * The result exposes lookup functions instead of mutable maps.
 */
export function prepareGuideRetrievalProfile(approvedKnowledge, profile) {
  const { topics, facts, sources } = approvedIndexes(approvedKnowledge);
  if (profile === undefined || profile === null) {
    return Object.freeze({
      profileVersion: null,
      aliasesForTopic: () => Object.freeze([]),
      aliasesForFact: () => Object.freeze([]),
      answerabilityPhrasesForFact: () => Object.freeze([]),
      propertyIdsForFact: () => Object.freeze([]),
      propertyIdsForQuestion: () => Object.freeze([]),
      excludedMatch: () => null,
      ambiguityMatch: () => null,
      bindingForFact: (factId) => {
        const fact = facts.get(factId);
        return fact && typeof fact.sourceLocation === 'string' && fact.sourceLocation.trim()
          ? Object.freeze({ factId, sourceId: fact.sourceId, sourceLocation: fact.sourceLocation })
          : null;
      },
      claimForFact: () => null,
      claims: Object.freeze([])
    });
  }

  exactFields(profile, PROFILE_FIELDS, 'retrievalProfile');
  if (profile.schemaVersion !== '1.0' ||
      profile.knowledgeVersion !== approvedKnowledge.knowledgeVersion ||
      profile.contentClassification !== approvedKnowledge.contentClassification ||
      !VERSION_PATTERN.test(profile.profileVersion)) {
    throw new TypeError('Retrieval profile version or classification is invalid.');
  }
  readApproval(profile.approval);
  const topicAliases = readAliases(
    profile.topicAliases,
    ALIAS_FIELDS,
    'topicId',
    topics,
    'retrievalProfile.topicAliases'
  );
  const factAliases = readAliases(
    profile.factAliases,
    FACT_ALIAS_FIELDS,
    'factId',
    facts,
    'retrievalProfile.factAliases'
  );
  const answerabilityPhrases = readAliases(
    profile.answerabilityPhrases,
    FACT_ALIAS_FIELDS,
    'factId',
    facts,
    'retrievalProfile.answerabilityPhrases'
  );
  const { definitions: propertyDefinitions, propertiesByFact } = readProperties(
    profile.propertyDefinitions,
    profile.factProperties,
    facts
  );
  const excluded = readExcluded(profile.excludedPhrases);
  const ambiguityRules = readAmbiguityRules(profile.ambiguityRules, topics);
  const bindings = readBindings(profile.sourceBindings, facts, sources);
  const { claims, claimsByFact } = readClaims(profile.claimGroups, facts);

  return Object.freeze({
    profileVersion: profile.profileVersion,
    aliasesForTopic: (topicId) => topicAliases.get(topicId) ?? Object.freeze([]),
    aliasesForFact: (factId) => factAliases.get(factId) ?? Object.freeze([]),
    answerabilityPhrasesForFact: (factId) => (
      answerabilityPhrases.get(factId) ?? Object.freeze([])
    ),
    propertyIdsForFact: (factId) => propertiesByFact.get(factId) ?? Object.freeze([]),
    propertyIdsForQuestion(normalizedQuestion) {
      const matched = new Set();
      const clauses = normalizedQuestion.split(/\band\b/).map((clause) => clause.trim()).filter(Boolean);
      for (const clause of clauses) {
        let earliest = Number.POSITIVE_INFINITY;
        let longest = 0;
        const clauseMatches = [];
        for (const [propertyId, phrases] of propertyDefinitions) {
          for (const phrase of phrases) {
            const position = ` ${clause} `.indexOf(` ${phrase} `);
            if (position < 0) continue;
            if (position < earliest || position === earliest && phrase.length > longest) {
              earliest = position;
              longest = phrase.length;
              clauseMatches.splice(0, clauseMatches.length, propertyId);
            } else if (position === earliest && phrase.length === longest) {
              clauseMatches.push(propertyId);
            }
          }
        }
        for (const propertyId of clauseMatches) matched.add(propertyId);
      }
      return Object.freeze([...matched]);
    },
    excludedMatch(normalizedQuestion) {
      return excluded.find(({ phrase }) => ` ${normalizedQuestion} `.includes(` ${phrase} `)) ?? null;
    },
    ambiguityMatch(normalizedQuestion) {
      return ambiguityRules.find(({ phrase }) => (
        ` ${normalizedQuestion} `.includes(` ${phrase} `)
      )) ?? null;
    },
    bindingForFact: (factId) => bindings.get(factId) ?? null,
    claimForFact: (factId) => claimsByFact.get(factId) ?? null,
    claims
  });
}
