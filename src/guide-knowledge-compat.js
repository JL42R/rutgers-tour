import { validateGuideKnowledge } from './guide-knowledge-schema.js';

export class KnowledgeCompatibilityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'KnowledgeCompatibilityError';
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
  throw new KnowledgeCompatibilityError(message);
}

function indexApproved(records, type) {
  if (!Array.isArray(records)) fail(`${type} records must be an array.`);
  const index = new Map();

  for (const record of records) {
    if (!isRecord(record) || record.status !== 'approved' || typeof record.id !== 'string') {
      fail(`The compatibility adapter accepts only approved ${type} records.`);
    }
    if (index.has(record.id)) fail(`Duplicate ${type} ID: ${record.id}`);
    index.set(record.id, record);
  }

  return index;
}

function uniqueTerms(label) {
  const terms = String(label)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((term) => term.length >= 3);

  return Object.freeze([...new Set(terms)]);
}

function freezeFacts(topic, factIndex, referenceCounts) {
  if (!Array.isArray(topic.factIds) || topic.factIds.length === 0) {
    fail(`Approved topic ${topic.id} has no approved facts.`);
  }

  const seen = new Set();
  return Object.freeze(topic.factIds.map((factId) => {
    if (seen.has(factId)) fail(`Topic ${topic.id} repeats fact ${factId}.`);
    seen.add(factId);

    const fact = factIndex.get(factId);
    if (!fact) fail(`Topic ${topic.id} references missing approved fact ${factId}.`);
    if (fact.topicId !== topic.id) {
      fail(`Fact ${factId} is joined to inconsistent topic ${topic.id}.`);
    }

    referenceCounts.set(factId, (referenceCounts.get(factId) ?? 0) + 1);
    return Object.freeze({
      id: fact.id,
      status: 'approved',
      text: fact.content
    });
  }));
}

function routeForTopic(topic, specialistIndex, zoneIndex) {
  const specialistIds = Array.isArray(topic.specialistIds) ? topic.specialistIds : [];
  const zoneIds = Array.isArray(topic.destinationZoneIds) ? topic.destinationZoneIds : [];

  if (specialistIds.length === 0 && zoneIds.length === 0) return null;
  if (specialistIds.length !== 1 || zoneIds.length !== 1) {
    fail(`Topic ${topic.id} cannot be represented by the single-route Stage 2 contract.`);
  }

  const specialist = specialistIndex.get(specialistIds[0]);
  const zone = zoneIndex.get(zoneIds[0]);
  if (!specialist || !zone) fail(`Topic ${topic.id} has a missing approved route relationship.`);
  if (specialist.destinationZoneId !== zone.id ||
      !Array.isArray(specialist.topicIds) ||
      !specialist.topicIds.includes(topic.id)) {
    fail(`Topic ${topic.id} has an inconsistent specialist-zone relationship.`);
  }
  if (typeof zone.canonicalDirections !== 'string' || !zone.canonicalDirections.trim()) {
    fail(`Topic ${topic.id} has no canonical approved directions.`);
  }

  return Object.freeze({ specialist, zone });
}

/**
 * Convert a frozen, validated approved view into the shapes used by the
 * existing Stage 2–4 modules. This adapter never changes lifecycle state.
 */
export function createLegacyGuideKnowledge(approvedKnowledge) {
  if (!isRecord(approvedKnowledge) || !Object.isFrozen(approvedKnowledge)) {
    fail('Expected the frozen result of createApprovedKnowledgeView().');
  }

  const validation = validateGuideKnowledge(approvedKnowledge);
  if (!validation.valid) fail('Approved knowledge view failed schema validation.');

  const sources = indexApproved(approvedKnowledge.sources, 'source');
  const topics = indexApproved(approvedKnowledge.topics, 'topic');
  const facts = indexApproved(approvedKnowledge.facts, 'fact');
  const specialists = indexApproved(approvedKnowledge.specialists, 'specialist');
  const zones = indexApproved(approvedKnowledge.zones, 'zone');
  const factReferenceCounts = new Map();

  for (const fact of facts.values()) {
    if (!topics.has(fact.topicId) || !sources.has(fact.sourceId)) {
      fail(`Fact ${fact.id} has a missing approved topic or source.`);
    }
  }

  const legacyTopics = Object.freeze([...topics.values()].map((topic) => {
    const nestedFacts = freezeFacts(topic, facts, factReferenceCounts);
    const route = routeForTopic(topic, specialists, zones);
    const converted = {
      id: topic.id,
      status: 'verified',
      type: route ? 'route' : 'answer',
      response: nestedFacts[0].text,
      phrases: Object.freeze([topic.label]),
      keywords: uniqueTerms(topic.label),
      facts: nestedFacts
    };

    if (route) {
      converted.destinationNpcId = route.specialist.id;
      converted.destinationZoneId = route.zone.id;
    }
    return Object.freeze(converted);
  }));

  for (const factId of facts.keys()) {
    if (factReferenceCounts.get(factId) !== 1) {
      fail(`Approved fact ${factId} must be joined to exactly one approved topic.`);
    }
  }

  const legacyZones = Object.freeze([...zones.values()].map((zone) => Object.freeze({
    id: zone.id,
    status: 'approved',
    directions: zone.canonicalDirections
  })));

  const legacySpecialists = Object.freeze([...specialists.values()].map((specialist) => {
    const destination = specialist.destinationZoneId === null
      ? null
      : zones.get(specialist.destinationZoneId);
    if (specialist.destinationZoneId !== null && !destination) {
      fail(`Specialist ${specialist.id} has a missing approved destination zone.`);
    }

    const topicFacts = [];
    for (const topicId of specialist.topicIds) {
      const topic = topics.get(topicId);
      if (!topic) fail(`Specialist ${specialist.id} references missing topic ${topicId}.`);
      for (const factId of topic.factIds) topicFacts.push(facts.get(factId).content);
    }

    return Object.freeze({
      id: specialist.id,
      status: 'approved',
      zoneId: specialist.destinationZoneId,
      topicIds: Object.freeze([...specialist.topicIds]),
      directions: destination?.canonicalDirections ?? null,
      expertise: topicFacts.join(' ')
    });
  }));

  return Object.freeze({
    knowledgeVersion: approvedKnowledge.knowledgeVersion,
    topics: legacyTopics,
    specialists: legacySpecialists,
    zones: legacyZones
  });
}
