import {
  isKnowledgeLifecycleTransitionAllowed,
  validateGuideKnowledge
} from './guide-knowledge-schema.js';

const COLLECTIONS = Object.freeze(['sources', 'topics', 'facts', 'specialists', 'zones']);
const ACTION_FIELDS = Object.freeze([
  'type',
  'recordIds',
  'nextStatus',
  'knowledgeVersion',
  'review'
]);
const REVIEW_FIELDS = Object.freeze(['reviewedBy', 'reference', 'reviewedAt']);
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class TrustedKnowledgeAdministrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TrustedKnowledgeAdministrationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new TrustedKnowledgeAdministrationError(code, message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, fields, label) {
  if (!isRecord(value)) fail('invalid_action', `${label} must be an object.`);
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    fail('invalid_action', `${label} fields are invalid.`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) fail('invalid_action', `${label} is missing ${field}.`);
  }
}

function boundedString(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    fail('invalid_action', `${label} must contain 1-${maximum} characters.`);
  }
  return value.trim();
}

function validateKnowledge(value) {
  const validation = validateGuideKnowledge(value);
  if (!validation.valid) fail('invalid_knowledge', 'Knowledge failed authoritative validation.');
}

function cloneKnowledge(value) {
  return structuredClone(value);
}

function nextVersion(current, proposed) {
  const value = boundedString(proposed, 'knowledgeVersion', 128);
  if (!VERSION_PATTERN.test(value) || value === current) {
    fail('invalid_version', 'A new valid knowledgeVersion is required.');
  }
  return value;
}

function candidateKnowledgeFrom(ingestion) {
  if (!isRecord(ingestion) || ingestion.schemaVersion !== '1.0' ||
      !isRecord(ingestion.candidateKnowledge)) {
    fail('invalid_ingestion', 'Expected a validated document-ingestion result.');
  }
  const candidate = ingestion.candidateKnowledge;
  validateKnowledge(candidate);
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(candidate[collection]) || candidate[collection].some((record) => (
      record.status !== 'draft' || record.approval !== null || record.recordVersion !== 1
    ))) {
      fail('invalid_ingestion', 'Document ingestion may add draft candidates only.');
    }
  }
  return candidate;
}

function frozenSnapshot(value) {
  const copy = cloneKnowledge(value);
  for (const collection of COLLECTIONS) {
    copy[collection] = Object.freeze(copy[collection].map((record) => {
      for (const [key, fieldValue] of Object.entries(record)) {
        if (Array.isArray(fieldValue)) record[key] = Object.freeze([...fieldValue]);
        else if (isRecord(fieldValue)) record[key] = Object.freeze({ ...fieldValue });
      }
      return Object.freeze(record);
    }));
  }
  return Object.freeze(copy);
}

/**
 * Add deterministic ingestion output as draft data. This operation accepts no
 * lifecycle or approval fields from document content.
 */
export function addDraftKnowledgeCandidates(knowledge, ingestion, options = {}) {
  validateKnowledge(knowledge);
  const candidate = candidateKnowledgeFrom(ingestion);
  if (candidate.contentClassification !== knowledge.contentClassification) {
    fail('classification_mismatch', 'Candidate classification does not match the knowledge corpus.');
  }

  const next = cloneKnowledge(knowledge);
  next.knowledgeVersion = nextVersion(knowledge.knowledgeVersion, options.knowledgeVersion);
  for (const collection of COLLECTIONS) {
    const existing = new Set(next[collection].map((record) => record.id));
    for (const record of candidate[collection]) {
      if (existing.has(record.id)) {
        fail('duplicate_identifier', `Candidate ${collection} ID already exists: ${record.id}.`);
      }
      existing.add(record.id);
      next[collection].push(cloneKnowledge(record));
    }
  }
  validateKnowledge(next);
  return frozenSnapshot(next);
}

function reviewMetadata(value) {
  exactFields(value, REVIEW_FIELDS, 'review');
  const reviewedAt = boundedString(value.reviewedAt, 'review.reviewedAt', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) {
    fail('invalid_action', 'review.reviewedAt must use YYYY-MM-DD form.');
  }
  return Object.freeze({
    reviewedBy: boundedString(value.reviewedBy, 'review.reviewedBy', 128),
    reference: boundedString(value.reference, 'review.reference', 256),
    reviewedAt
  });
}

function recordLocations(knowledge, recordIds) {
  if (!Array.isArray(recordIds) || recordIds.length === 0 || recordIds.length > 100) {
    fail('invalid_action', 'recordIds must contain 1-100 identifiers.');
  }
  const requested = new Set();
  for (const recordId of recordIds) {
    if (typeof recordId !== 'string' || !IDENTIFIER_PATTERN.test(recordId) || requested.has(recordId)) {
      fail('invalid_action', 'recordIds contains an invalid or duplicate identifier.');
    }
    requested.add(recordId);
  }

  const locations = [];
  for (const recordId of requested) {
    const matches = [];
    for (const collection of COLLECTIONS) {
      const index = knowledge[collection].findIndex((record) => record.id === recordId);
      if (index >= 0) matches.push({ collection, index });
    }
    if (matches.length !== 1) {
      fail('unknown_or_ambiguous_record', `Record ID must resolve exactly once: ${recordId}.`);
    }
    locations.push(matches[0]);
  }
  return locations;
}

/**
 * Apply one atomic mock-administrative lifecycle action. Calling this function
 * is the trusted test operation; it is not visitor authentication.
 */
export function applyTrustedKnowledgeTransition(knowledge, action) {
  validateKnowledge(knowledge);
  exactFields(action, ACTION_FIELDS, 'action');
  if (action.type !== 'trusted_mock_transition') {
    fail('invalid_action', 'Only a trusted_mock_transition action is supported.');
  }
  if (!['in_review', 'approved', 'retired'].includes(action.nextStatus)) {
    fail('invalid_action', 'nextStatus is not an administrative target state.');
  }
  const review = reviewMetadata(action.review);
  const locations = recordLocations(knowledge, action.recordIds);
  const next = cloneKnowledge(knowledge);
  next.knowledgeVersion = nextVersion(knowledge.knowledgeVersion, action.knowledgeVersion);

  for (const location of locations) {
    const record = next[location.collection][location.index];
    if (!isKnowledgeLifecycleTransitionAllowed(record.status, action.nextStatus)) {
      fail(
        'invalid_transition',
        `Lifecycle transition ${record.status} -> ${action.nextStatus} is not allowed for ${record.id}.`
      );
    }
    record.status = action.nextStatus;
    record.recordVersion += 1;
    record.updatedAt = review.reviewedAt;
    record.approval = { ...review };
  }

  validateKnowledge(next);
  return frozenSnapshot(next);
}

export function candidateRecordIds(ingestion) {
  const candidate = candidateKnowledgeFrom(ingestion);
  return Object.freeze(COLLECTIONS.flatMap((collection) => (
    candidate[collection].map((record) => record.id)
  )));
}
