export const GUIDE_KNOWLEDGE_SCHEMA_VERSION = '1.0';

export const KNOWLEDGE_LIFECYCLE_STATUSES = Object.freeze([
  'draft',
  'in_review',
  'approved',
  'retired'
]);

const KNOWLEDGE_LIFECYCLE_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['in_review']),
  in_review: Object.freeze(['draft', 'approved']),
  approved: Object.freeze(['retired']),
  retired: Object.freeze([])
});

/**
 * Check an intentional publication-state change. Snapshot validation remains
 * separate because a valid record does not prove that its transition was valid.
 */
export function isKnowledgeLifecycleTransitionAllowed(previousStatus, nextStatus) {
  return KNOWLEDGE_LIFECYCLE_TRANSITIONS[previousStatus]?.includes(nextStatus) ?? false;
}

const CLASSIFICATIONS = Object.freeze(['production', 'synthetic_fixture']);
const TOP_LEVEL_FIELDS = Object.freeze([
  'schemaVersion',
  'knowledgeVersion',
  'contentClassification',
  'sources',
  'topics',
  'facts',
  'specialists',
  'zones'
]);
const APPROVAL_FIELDS = Object.freeze(['reviewedBy', 'reference', 'reviewedAt']);
const SOURCE_FIELDS = Object.freeze([
  'id',
  'title',
  'reference',
  'location',
  'status',
  'recordVersion',
  'updatedAt',
  'approval'
]);
const TOPIC_FIELDS = Object.freeze([
  'id',
  'category',
  'label',
  'status',
  'recordVersion',
  'updatedAt',
  'approval',
  'factIds',
  'specialistIds',
  'destinationZoneIds'
]);
const FACT_FIELDS = Object.freeze([
  'id',
  'topicId',
  'content',
  'sourceId',
  'sourceLocation',
  'status',
  'recordVersion',
  'updatedAt',
  'approval',
  'relatedSpecialistIds',
  'relatedDestinationZoneIds'
]);
const SPECIALIST_FIELDS = Object.freeze([
  'id',
  'name',
  'status',
  'recordVersion',
  'updatedAt',
  'approval',
  'topicIds',
  'destinationZoneId'
]);
const ZONE_FIELDS = Object.freeze([
  'id',
  'name',
  'status',
  'recordVersion',
  'updatedAt',
  'approval',
  'canonicalDirections'
]);

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, path, code, message) {
  errors.push(Object.freeze({ path, code, message }));
}

function validateExactFields(value, fields, path, errors) {
  if (!isRecord(value)) {
    addError(errors, path, 'invalid_type', 'Expected an object.');
    return false;
  }

  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      addError(errors, `${path}.${key}`, 'unknown_property', 'Unexpected property.');
    }
  }

  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      addError(errors, `${path}.${key}`, 'missing_property', 'Required property is missing.');
    }
  }

  return true;
}

function validateString(value, path, errors, maximum = 500) {
  if (typeof value !== 'string') {
    addError(errors, path, 'invalid_type', 'Expected a string.');
    return false;
  }
  if (!value.trim() || value.length > maximum) {
    addError(errors, path, 'invalid_length', `Expected 1-${maximum} characters.`);
    return false;
  }
  return true;
}

function validateNullableString(value, path, errors, maximum = 500) {
  if (value === null) return true;
  return validateString(value, path, errors, maximum);
}

function validateIdentifier(value, path, errors) {
  if (!validateString(value, path, errors, 64)) return false;
  if (!IDENTIFIER_PATTERN.test(value)) {
    addError(errors, path, 'invalid_identifier', 'Use lowercase hyphenated identifiers.');
    return false;
  }
  return true;
}

function validateDate(value, path, errors) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    addError(errors, path, 'invalid_date', 'Expected an ISO date in YYYY-MM-DD form.');
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) {
    addError(errors, path, 'invalid_date', 'Date does not exist.');
    return false;
  }
  return true;
}

function validateApproval(value, status, path, errors) {
  if (value === null) {
    if (status === 'approved') {
      addError(errors, path, 'missing_approval', 'Approved records require review metadata.');
    }
    return;
  }

  if (!validateExactFields(value, APPROVAL_FIELDS, path, errors)) return;
  validateString(value.reviewedBy, `${path}.reviewedBy`, errors, 128);
  validateString(value.reference, `${path}.reference`, errors, 256);
  validateDate(value.reviewedAt, `${path}.reviewedAt`, errors);
}

function validateLifecycleRecord(record, path, errors) {
  validateIdentifier(record.id, `${path}.id`, errors);
  if (!KNOWLEDGE_LIFECYCLE_STATUSES.includes(record.status)) {
    addError(errors, `${path}.status`, 'invalid_status', 'Unknown lifecycle status.');
  }
  if (!Number.isInteger(record.recordVersion) || record.recordVersion < 1) {
    addError(errors, `${path}.recordVersion`, 'invalid_version', 'Record version must be positive.');
  }
  validateDate(record.updatedAt, `${path}.updatedAt`, errors);
  validateApproval(record.approval, record.status, `${path}.approval`, errors);
}

function validateIdentifierArray(value, path, errors) {
  if (!Array.isArray(value)) {
    addError(errors, path, 'invalid_type', 'Expected an array.');
    return;
  }
  if (value.length > 50) {
    addError(errors, path, 'invalid_length', 'At most 50 identifiers are allowed.');
  }

  const seen = new Set();
  value.forEach((identifier, index) => {
    if (!validateIdentifier(identifier, `${path}[${index}]`, errors)) return;
    if (seen.has(identifier)) {
      addError(errors, `${path}[${index}]`, 'duplicate_reference', 'Reference is duplicated.');
    }
    seen.add(identifier);
  });
}

function validateCollection(value, path, fields, errors, validateRecord) {
  if (!Array.isArray(value)) {
    addError(errors, path, 'invalid_type', 'Expected an array.');
    return;
  }

  const identifiers = new Set();
  value.forEach((record, index) => {
    const recordPath = `${path}[${index}]`;
    if (!validateExactFields(record, fields, recordPath, errors)) return;
    validateLifecycleRecord(record, recordPath, errors);
    validateRecord(record, recordPath, errors);

    if (typeof record.id === 'string') {
      if (identifiers.has(record.id)) {
        addError(errors, `${recordPath}.id`, 'duplicate_identifier', 'Record ID is duplicated.');
      }
      identifiers.add(record.id);
    }
  });
}

function validateSources(value, errors) {
  validateCollection(value, '$.sources', SOURCE_FIELDS, errors, (source, path) => {
    validateString(source.title, `${path}.title`, errors, 200);
    validateString(source.reference, `${path}.reference`, errors, 500);
    validateNullableString(source.location, `${path}.location`, errors, 200);
  });
}

function validateTopics(value, errors) {
  validateCollection(value, '$.topics', TOPIC_FIELDS, errors, (topic, path) => {
    validateIdentifier(topic.category, `${path}.category`, errors);
    validateString(topic.label, `${path}.label`, errors, 160);
    validateIdentifierArray(topic.factIds, `${path}.factIds`, errors);
    validateIdentifierArray(topic.specialistIds, `${path}.specialistIds`, errors);
    validateIdentifierArray(topic.destinationZoneIds, `${path}.destinationZoneIds`, errors);
  });
}

function validateFacts(value, errors) {
  validateCollection(value, '$.facts', FACT_FIELDS, errors, (fact, path) => {
    validateIdentifier(fact.topicId, `${path}.topicId`, errors);
    validateString(fact.content, `${path}.content`, errors, 1500);
    validateIdentifier(fact.sourceId, `${path}.sourceId`, errors);
    validateNullableString(fact.sourceLocation, `${path}.sourceLocation`, errors, 200);
    validateIdentifierArray(fact.relatedSpecialistIds, `${path}.relatedSpecialistIds`, errors);
    validateIdentifierArray(
      fact.relatedDestinationZoneIds,
      `${path}.relatedDestinationZoneIds`,
      errors
    );
  });
}

function validateSpecialists(value, errors) {
  validateCollection(value, '$.specialists', SPECIALIST_FIELDS, errors, (specialist, path) => {
    validateString(specialist.name, `${path}.name`, errors, 160);
    validateIdentifierArray(specialist.topicIds, `${path}.topicIds`, errors);
    if (specialist.destinationZoneId !== null) {
      validateIdentifier(specialist.destinationZoneId, `${path}.destinationZoneId`, errors);
    }
  });
}

function validateZones(value, errors) {
  validateCollection(value, '$.zones', ZONE_FIELDS, errors, (zone, path) => {
    validateString(zone.name, `${path}.name`, errors, 160);
    validateNullableString(zone.canonicalDirections, `${path}.canonicalDirections`, errors, 500);
    if (zone.status === 'approved' && !validateString(
      zone.canonicalDirections,
      `${path}.canonicalDirections`,
      errors,
      500
    )) {
      addError(
        errors,
        `${path}.canonicalDirections`,
        'missing_canonical_directions',
        'Approved destination zones require canonical directions.'
      );
    }
  });
}

function indexById(records) {
  const index = new Map();
  if (!Array.isArray(records)) return index;
  for (const record of records) {
    if (isRecord(record) && typeof record.id === 'string' && !index.has(record.id)) {
      index.set(record.id, record);
    }
  }
  return index;
}

function requireReference(index, id, path, type, errors) {
  const record = index.get(id);
  if (!record) {
    addError(errors, path, 'unknown_reference', `Referenced ${type} does not exist.`);
    return null;
  }
  return record;
}

function requireApprovedReference(index, id, path, type, errors) {
  const record = requireReference(index, id, path, type, errors);
  if (record && record.status !== 'approved') {
    addError(errors, path, 'unapproved_reference', `Approved data cannot reference a non-approved ${type}.`);
    return null;
  }
  return record;
}

function validateReferenceArray(ids, index, path, type, approvedOnly, errors) {
  if (!Array.isArray(ids)) return;
  ids.forEach((id, itemIndex) => {
    if (typeof id !== 'string') return;
    const itemPath = `${path}[${itemIndex}]`;
    if (approvedOnly) requireApprovedReference(index, id, itemPath, type, errors);
    else requireReference(index, id, itemPath, type, errors);
  });
}

function validateReferences(knowledge, errors) {
  const sources = indexById(knowledge.sources);
  const topics = indexById(knowledge.topics);
  const facts = indexById(knowledge.facts);
  const specialists = indexById(knowledge.specialists);
  const zones = indexById(knowledge.zones);

  if (Array.isArray(knowledge.topics)) {
    knowledge.topics.forEach((topic, index) => {
      if (!isRecord(topic)) return;
      const approved = topic.status === 'approved';
      const path = `$.topics[${index}]`;
      validateReferenceArray(topic.factIds, facts, `${path}.factIds`, 'fact', approved, errors);
      validateReferenceArray(
        topic.specialistIds,
        specialists,
        `${path}.specialistIds`,
        'specialist',
        approved,
        errors
      );
      validateReferenceArray(
        topic.destinationZoneIds,
        zones,
        `${path}.destinationZoneIds`,
        'zone',
        approved,
        errors
      );
      if (approved && Array.isArray(topic.factIds) && topic.factIds.length === 0) {
        addError(errors, `${path}.factIds`, 'missing_approved_fact', 'Approved topics need a fact.');
      }
      if (Array.isArray(topic.factIds)) {
        topic.factIds.forEach((factId, factIndex) => {
          const fact = facts.get(factId);
          if (fact && fact.topicId !== topic.id) {
            addError(
              errors,
              `${path}.factIds[${factIndex}]`,
              'topic_mismatch',
              'Fact belongs to a different topic.'
            );
          }
        });
      }
    });
  }

  if (Array.isArray(knowledge.facts)) {
    knowledge.facts.forEach((fact, index) => {
      if (!isRecord(fact)) return;
      const approved = fact.status === 'approved';
      const path = `$.facts[${index}]`;
      if (typeof fact.topicId === 'string') {
        if (approved) requireApprovedReference(topics, fact.topicId, `${path}.topicId`, 'topic', errors);
        else requireReference(topics, fact.topicId, `${path}.topicId`, 'topic', errors);
      }
      if (typeof fact.sourceId === 'string') {
        if (approved) requireApprovedReference(sources, fact.sourceId, `${path}.sourceId`, 'source', errors);
        else requireReference(sources, fact.sourceId, `${path}.sourceId`, 'source', errors);
      }
      validateReferenceArray(
        fact.relatedSpecialistIds,
        specialists,
        `${path}.relatedSpecialistIds`,
        'specialist',
        approved,
        errors
      );
      validateReferenceArray(
        fact.relatedDestinationZoneIds,
        zones,
        `${path}.relatedDestinationZoneIds`,
        'zone',
        approved,
        errors
      );
    });
  }

  if (Array.isArray(knowledge.specialists)) {
    knowledge.specialists.forEach((specialist, index) => {
      if (!isRecord(specialist)) return;
      const approved = specialist.status === 'approved';
      const path = `$.specialists[${index}]`;
      validateReferenceArray(
        specialist.topicIds,
        topics,
        `${path}.topicIds`,
        'topic',
        approved,
        errors
      );
      if (typeof specialist.destinationZoneId === 'string') {
        const zone = approved
          ? requireApprovedReference(
            zones,
            specialist.destinationZoneId,
            `${path}.destinationZoneId`,
            'zone',
            errors
          )
          : requireReference(
            zones,
            specialist.destinationZoneId,
            `${path}.destinationZoneId`,
            'zone',
            errors
          );
        if (approved && zone && !zone.canonicalDirections?.trim()) {
          addError(
            errors,
            `${path}.destinationZoneId`,
            'missing_canonical_directions',
            'Approved specialist destinations require approved canonical directions.'
          );
        }
      }
    });
  }
}

function validationResult(errors) {
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateGuideKnowledge(value) {
  const errors = [];

  try {
    if (!validateExactFields(value, TOP_LEVEL_FIELDS, '$', errors)) {
      return validationResult(errors);
    }

    if (value.schemaVersion !== GUIDE_KNOWLEDGE_SCHEMA_VERSION) {
      addError(
        errors,
        '$.schemaVersion',
        'unsupported_schema_version',
        `Only schema version ${GUIDE_KNOWLEDGE_SCHEMA_VERSION} is supported.`
      );
    }
    if (!validateString(value.knowledgeVersion, '$.knowledgeVersion', errors, 128) ||
        !VERSION_PATTERN.test(value.knowledgeVersion)) {
      addError(errors, '$.knowledgeVersion', 'invalid_version', 'Knowledge version is invalid.');
    }
    if (!CLASSIFICATIONS.includes(value.contentClassification)) {
      addError(
        errors,
        '$.contentClassification',
        'invalid_classification',
        'Content classification must be production or synthetic_fixture.'
      );
    }

    validateSources(value.sources, errors);
    validateTopics(value.topics, errors);
    validateFacts(value.facts, errors);
    validateSpecialists(value.specialists, errors);
    validateZones(value.zones, errors);
    validateReferences(value, errors);
  } catch {
    addError(errors, '$', 'malformed_data', 'Knowledge data could not be safely inspected.');
  }

  return validationResult(errors);
}

function freezeRecord(record) {
  const copy = {};
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) copy[key] = Object.freeze([...value]);
    else if (isRecord(value)) copy[key] = Object.freeze({ ...value });
    else copy[key] = value;
  }
  return Object.freeze(copy);
}

function approvedRecords(records) {
  return Object.freeze(records.filter((record) => record.status === 'approved').map(freezeRecord));
}

/**
 * Return the server-authoritative subset. Draft, in-review, and retired records
 * remain version-controlled but cannot be retrieved for visitor answers.
 */
export function createApprovedKnowledgeView(value) {
  const validation = validateGuideKnowledge(value);
  if (!validation.valid) {
    return Object.freeze({ valid: false, errors: validation.errors, knowledge: null });
  }

  return Object.freeze({
    valid: true,
    errors: Object.freeze([]),
    knowledge: Object.freeze({
      schemaVersion: value.schemaVersion,
      knowledgeVersion: value.knowledgeVersion,
      contentClassification: value.contentClassification,
      sources: approvedRecords(value.sources),
      topics: approvedRecords(value.topics),
      facts: approvedRecords(value.facts),
      specialists: approvedRecords(value.specialists),
      zones: approvedRecords(value.zones)
    })
  });
}

export function createKnowledgeCatalog(value) {
  const approved = createApprovedKnowledgeView(value);
  if (!approved.valid) return approved;

  const knowledge = approved.knowledge;
  const zoneDirections = Object.freeze(Object.fromEntries(
    knowledge.zones.map((record) => [record.id, record.canonicalDirections])
  ));
  const specialistNames = Object.freeze(Object.fromEntries(
    knowledge.specialists.map((record) => [record.id, record.name])
  ));
  const zoneNames = Object.freeze(Object.fromEntries(
    knowledge.zones.map((record) => [record.id, record.name])
  ));
  return Object.freeze({
    valid: true,
    errors: Object.freeze([]),
    catalog: Object.freeze({
      topicIds: Object.freeze(knowledge.topics.map((record) => record.id)),
      specialistNpcIds: Object.freeze(knowledge.specialists.map((record) => record.id)),
      zoneIds: Object.freeze(knowledge.zones.map((record) => record.id)),
      factIds: Object.freeze(knowledge.facts.map((record) => record.id)),
      sourceIds: Object.freeze(knowledge.sources.map((record) => record.id)),
      knowledgeVersions: Object.freeze([knowledge.knowledgeVersion]),
      factSourceIds: Object.freeze(Object.fromEntries(
        knowledge.facts.map((record) => [record.id, record.sourceId])
      )),
      specialistRoutes: Object.freeze(Object.fromEntries(
        knowledge.specialists.map((record) => [record.id, Object.freeze({
          destinationZoneId: record.destinationZoneId,
          specialistName: record.name,
          destinationZoneName: record.destinationZoneId === null
            ? null
            : zoneNames[record.destinationZoneId],
          canonicalDirections: record.destinationZoneId === null
            ? null
            : zoneDirections[record.destinationZoneId]
        })])
      )),
      specialistNames,
      zoneNames,
      zoneDirections
    })
  });
}
