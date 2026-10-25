import {
  createApprovedKnowledgeView,
  createKnowledgeCatalog
} from '../../src/guide-knowledge-schema.js';
import { createLegacyGuideKnowledge } from '../../src/guide-knowledge-compat.js';
import { createApprovedKnowledgeRetriever } from '../../src/guide-knowledge-retrieval.js';

export class ApprovedKnowledgeError extends Error {
  constructor(message, validationErrors = []) {
    super(message);
    this.name = 'ApprovedKnowledgeError';
    this.validationErrors = Object.freeze([...validationErrors]);
  }
}

function indexById(records) {
  return new Map(records.map((record) => [record.id, record]));
}

export function prepareApprovedKnowledge(rawKnowledge, options = {}) {
  const approvedResult = createApprovedKnowledgeView(rawKnowledge);
  if (!approvedResult.valid) {
    throw new ApprovedKnowledgeError(
      'Knowledge failed authoritative validation.',
      approvedResult.errors
    );
  }

  const catalogResult = createKnowledgeCatalog(rawKnowledge);
  if (!catalogResult.valid) {
    throw new ApprovedKnowledgeError(
      'Knowledge catalog could not be created.',
      catalogResult.errors
    );
  }

  const approved = approvedResult.knowledge;
  const legacy = createLegacyGuideKnowledge(approved);
  const retriever = createApprovedKnowledgeRetriever(approved, {
    retrievalProfile: options.retrievalProfile
  });
  const facts = indexById(approved.facts);
  const topics = indexById(approved.topics);
  const specialists = indexById(approved.specialists);
  const zones = indexById(approved.zones);

  return Object.freeze({
    knowledgeVersion: approved.knowledgeVersion,
    retrievalProfileVersion: retriever.profileVersion,
    approved,
    catalog: catalogResult.catalog,
    legacy,
    retrieve(question, options) {
      return retriever.search(question, options);
    },
    getFact(factId) {
      return facts.get(factId) ?? null;
    },
    getTopic(topicId) {
      return topics.get(topicId) ?? null;
    },
    getSpecialist(specialistId) {
      return specialists.get(specialistId) ?? null;
    },
    getZone(zoneId) {
      return zones.get(zoneId) ?? null;
    },
    createFactReferences(factIds) {
      if (!Array.isArray(factIds)) return null;
      const references = [];
      const seen = new Set();
      for (const factId of factIds) {
        const fact = facts.get(factId);
        if (!fact || seen.has(factId)) return null;
        seen.add(factId);
        references.push(Object.freeze({ factId: fact.id, sourceId: fact.sourceId }));
      }
      return Object.freeze(references);
    },
    createEvidenceBoundAnswer(factIds) {
      if (!Array.isArray(factIds) || factIds.length === 0) return null;
      const selected = [];
      const seen = new Set();
      for (const factId of factIds) {
        const fact = facts.get(factId);
        if (!fact || seen.has(factId)) return null;
        seen.add(factId);
        selected.push(fact.content);
      }
      return selected.join(' ');
    }
  });
}

export function createStaticApprovedKnowledgeLoader(rawKnowledge, options = {}) {
  const prepared = prepareApprovedKnowledge(rawKnowledge, options);
  return async function loadApprovedKnowledge() {
    return prepared;
  };
}
