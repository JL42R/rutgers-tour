export const GUIDE_API_SCHEMA_VERSION = '1.1';
export const GUIDE_API_LEGACY_SCHEMA_VERSION = '1.0';

const SUPPORTED_GUIDE_API_SCHEMA_VERSIONS = Object.freeze([
  GUIDE_API_LEGACY_SCHEMA_VERSION,
  GUIDE_API_SCHEMA_VERSION
]);

export const GUIDE_RESPONSE_OUTCOMES = Object.freeze([
  'answered',
  'clarify',
  'unsupported',
  'unavailable'
]);

export const GUIDE_ERROR_CODES = Object.freeze([
  'provider_timeout',
  'provider_unavailable',
  'rate_limited',
  'invalid_request',
  'internal_error'
]);

export const MAX_GUIDE_QUESTION_LENGTH = 300;
export const MAX_CONTEXT_IDENTIFIERS = 6;
export const MAX_GUIDE_ANSWER_LENGTH = 800;

const REQUEST_FIELDS = Object.freeze([
  'schemaVersion',
  'requestId',
  'question',
  'temporaryContext'
]);

const CONTEXT_FIELDS = Object.freeze([
  'topicIds',
  'specialistNpcIds',
  'destinationZoneIds'
]);

const RESPONSE_FIELDS = Object.freeze([
  'schemaVersion',
  'requestId',
  'outcome',
  'answerText',
  'factReferences',
  'topicId',
  'specialistNpcId',
  'destinationZoneId',
  'canonicalDirections',
  'knowledgeVersion',
  'error'
]);
const RESPONSE_DISPLAY_FIELDS = Object.freeze([
  'specialistName',
  'destinationZoneName'
]);

const FACT_REFERENCE_FIELDS = Object.freeze(['factId', 'sourceId']);
const ERROR_FIELDS = Object.freeze(['code']);
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

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

function validateBoundedString(value, path, errors, options = {}) {
  const minimum = options.minimum ?? 1;
  const maximum = options.maximum ?? 128;
  if (typeof value !== 'string') {
    addError(errors, path, 'invalid_type', 'Expected a string.');
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < minimum || value.length > maximum) {
    addError(errors, path, 'invalid_length', `Expected ${minimum}-${maximum} characters.`);
    return false;
  }

  if (options.pattern && !options.pattern.test(value)) {
    addError(errors, path, 'invalid_format', 'String format is invalid.');
    return false;
  }

  return true;
}

function validateNullableIdentifier(value, path, errors, allowedIds) {
  if (value === null) return true;
  if (!validateBoundedString(value, path, errors, {
    maximum: 64,
    pattern: IDENTIFIER_PATTERN
  })) {
    return false;
  }

  if (allowedIds && !allowedIds.has(value)) {
    addError(errors, path, 'unknown_identifier', 'Identifier is not in the authoritative catalog.');
    return false;
  }

  return true;
}

function validateRequiredIdentifier(value, path, errors, allowedIds) {
  if (value === null) {
    addError(errors, path, 'invalid_identifier', 'Identifier cannot be null.');
    return false;
  }
  return validateNullableIdentifier(value, path, errors, allowedIds);
}

function toAllowedSet(value) {
  if (value instanceof Set) return value;
  return Array.isArray(value) ? new Set(value) : null;
}

function toLookupMap(value) {
  if (value instanceof Map) return value;
  return isRecord(value) ? new Map(Object.entries(value)) : null;
}

function readCatalog(options) {
  const catalog = isRecord(options?.catalog) ? options.catalog : {};
  return {
    topicIds: toAllowedSet(catalog.topicIds),
    specialistNpcIds: toAllowedSet(catalog.specialistNpcIds),
    zoneIds: toAllowedSet(catalog.zoneIds),
    factIds: toAllowedSet(catalog.factIds),
    sourceIds: toAllowedSet(catalog.sourceIds),
    knowledgeVersions: toAllowedSet(catalog.knowledgeVersions),
    factSourceIds: toLookupMap(catalog.factSourceIds),
    specialistRoutes: toLookupMap(catalog.specialistRoutes),
    specialistNames: toLookupMap(catalog.specialistNames),
    zoneNames: toLookupMap(catalog.zoneNames),
    zoneDirections: toLookupMap(catalog.zoneDirections)
  };
}

function validateIdentifierArray(value, path, errors, allowedIds) {
  if (!Array.isArray(value)) {
    addError(errors, path, 'invalid_type', 'Expected an array.');
    return;
  }

  if (value.length > MAX_CONTEXT_IDENTIFIERS) {
    addError(
      errors,
      path,
      'context_too_large',
      `At most ${MAX_CONTEXT_IDENTIFIERS} identifiers are allowed.`
    );
  }

  const seen = new Set();
  value.forEach((identifier, index) => {
    const itemPath = `${path}[${index}]`;
    const valid = validateNullableIdentifier(identifier, itemPath, errors, allowedIds);
    if (identifier === null) {
      addError(errors, itemPath, 'invalid_identifier', 'Context identifiers cannot be null.');
      return;
    }
    if (!valid) return;
    if (seen.has(identifier)) {
      addError(errors, itemPath, 'duplicate_identifier', 'Identifier is duplicated.');
    }
    seen.add(identifier);
  });
}

function validateTemporaryContext(value, errors, catalog) {
  if (!validateExactFields(value, CONTEXT_FIELDS, '$.temporaryContext', errors)) return;

  validateIdentifierArray(
    value.topicIds,
    '$.temporaryContext.topicIds',
    errors,
    catalog.topicIds
  );
  validateIdentifierArray(
    value.specialistNpcIds,
    '$.temporaryContext.specialistNpcIds',
    errors,
    catalog.specialistNpcIds
  );
  validateIdentifierArray(
    value.destinationZoneIds,
    '$.temporaryContext.destinationZoneIds',
    errors,
    catalog.zoneIds
  );

  if (CONTEXT_FIELDS.reduce((count, key) => (
    count + (Array.isArray(value[key]) ? value[key].length : 0)
  ), 0) > MAX_CONTEXT_IDENTIFIERS) {
    addError(
      errors,
      '$.temporaryContext',
      'context_too_large',
      `Temporary context is limited to ${MAX_CONTEXT_IDENTIFIERS} identifiers total.`
    );
  }
}

function validateSchemaVersion(value, errors) {
  if (!SUPPORTED_GUIDE_API_SCHEMA_VERSIONS.includes(value)) {
    addError(
      errors,
      '$.schemaVersion',
      'unsupported_schema_version',
      `Supported schema versions: ${SUPPORTED_GUIDE_API_SCHEMA_VERSIONS.join(', ')}.`
    );
  }
}

function validateRequestId(value, errors) {
  validateBoundedString(value, '$.requestId', errors, {
    maximum: 128,
    pattern: TOKEN_PATTERN
  });
}

function result(errors) {
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateGuideRequest(value, options = {}) {
  const errors = [];

  try {
    if (!validateExactFields(value, REQUEST_FIELDS, '$', errors)) return result(errors);

    validateSchemaVersion(value.schemaVersion, errors);
    validateRequestId(value.requestId, errors);
    validateBoundedString(value.question, '$.question', errors, {
      maximum: options.maxQuestionLength ?? MAX_GUIDE_QUESTION_LENGTH
    });
    validateTemporaryContext(value.temporaryContext, errors, readCatalog(options));
  } catch {
    addError(errors, '$', 'malformed_data', 'Request could not be safely inspected.');
  }

  return result(errors);
}

function validateFactReferences(value, errors, catalog) {
  if (!Array.isArray(value)) {
    addError(errors, '$.factReferences', 'invalid_type', 'Expected an array.');
    return;
  }

  if (value.length > 20) {
    addError(errors, '$.factReferences', 'invalid_length', 'At most 20 fact references are allowed.');
  }

  const seenFacts = new Set();
  value.forEach((reference, index) => {
    const path = `$.factReferences[${index}]`;
    if (!validateExactFields(reference, FACT_REFERENCE_FIELDS, path, errors)) return;

    const factValid = validateRequiredIdentifier(
      reference.factId,
      `${path}.factId`,
      errors,
      catalog.factIds
    );
    validateRequiredIdentifier(
      reference.sourceId,
      `${path}.sourceId`,
      errors,
      catalog.sourceIds
    );

    if (factValid && catalog.factSourceIds?.has(reference.factId) &&
        catalog.factSourceIds.get(reference.factId) !== reference.sourceId) {
      addError(
        errors,
        `${path}.sourceId`,
        'source_mismatch',
        'Source is not the authoritative source for this fact.'
      );
    }

    if (factValid && reference.factId !== null) {
      if (seenFacts.has(reference.factId)) {
        addError(errors, `${path}.factId`, 'duplicate_identifier', 'Fact is referenced twice.');
      }
      seenFacts.add(reference.factId);
    }
  });
}

function validateError(value, errors) {
  if (value === null) return;
  if (!validateExactFields(value, ERROR_FIELDS, '$.error', errors)) return;
  if (!GUIDE_ERROR_CODES.includes(value.code)) {
    addError(errors, '$.error.code', 'invalid_error_code', 'Unknown error code.');
  }
}

function validateResponseCombinations(value, errors) {
  const references = Array.isArray(value.factReferences) ? value.factReferences : [];
  const hasDestination = value.destinationZoneId !== null;
  const hasDirections = value.canonicalDirections !== null;
  const hasSpecialist = value.specialistNpcId !== null;

  if (hasDestination !== hasDirections) {
    addError(
      errors,
      '$.canonicalDirections',
      'invalid_combination',
      'Canonical directions and a destination zone must appear together.'
    );
  }

  if (hasSpecialist && !hasDestination) {
    addError(
      errors,
      '$.specialistNpcId',
      'invalid_combination',
      'A specialist recommendation requires a destination zone and directions.'
    );
  }

  if (value.outcome === 'answered') {
    if (value.topicId === null || references.length === 0) {
      addError(
        errors,
        '$.outcome',
        'invalid_combination',
        'Answered responses require a topic and at least one fact/source reference.'
      );
    }
    if (value.error !== null) {
      addError(errors, '$.error', 'invalid_combination', 'Answered responses cannot contain an error.');
    }
    return;
  }

  if (value.outcome === 'unavailable') {
    if (value.error === null) {
      addError(errors, '$.error', 'invalid_combination', 'Unavailable responses require an error.');
    }
  } else if (value.error !== null) {
    addError(errors, '$.error', 'invalid_combination', 'Only unavailable responses may contain an error.');
  }

  if (references.length > 0 || value.topicId !== null || hasSpecialist || hasDestination || hasDirections) {
    addError(
      errors,
      '$.outcome',
      'invalid_combination',
      'Non-answered responses cannot assert facts or canonical routing.'
    );
  }
}

function validateCanonicalData(value, errors, catalog) {
  if (value.destinationZoneId !== null && catalog.zoneDirections?.has(value.destinationZoneId) &&
      catalog.zoneDirections.get(value.destinationZoneId) !== value.canonicalDirections) {
    addError(
      errors,
      '$.canonicalDirections',
      'noncanonical_directions',
      'Directions do not match the authoritative destination record.'
    );
  }

  if (value.specialistNpcId === null || !catalog.specialistRoutes?.has(value.specialistNpcId)) return;
  const route = catalog.specialistRoutes.get(value.specialistNpcId);
  if (!isRecord(route) ||
      route.destinationZoneId !== value.destinationZoneId ||
      route.canonicalDirections !== value.canonicalDirections) {
    addError(
      errors,
      '$.specialistNpcId',
      'invalid_route',
      'Specialist routing does not match the authoritative catalog.'
    );
  }
}

function validateOptionalDisplayName(value, field, identifier, names, errors) {
  if (!Object.hasOwn(value, field)) return;
  const path = `$.${field}`;
  const displayName = value[field];

  if (displayName === null) {
    if (identifier !== null) {
      addError(errors, path, 'invalid_combination', 'A display name cannot be null when its ID is present.');
    }
    return;
  }
  if (!validateBoundedString(displayName, path, errors, { maximum: 160 })) return;
  if (identifier === null) {
    addError(errors, path, 'invalid_combination', 'A display name requires its canonical ID.');
    return;
  }
  if (!names?.has(identifier) || names.get(identifier) !== displayName) {
    addError(
      errors,
      path,
      'noncanonical_display_name',
      'Display name does not match the authoritative catalog.'
    );
  }
}

export function validateGuideResponse(value, options = {}) {
  const errors = [];

  try {
    const responseFields = value?.schemaVersion === GUIDE_API_LEGACY_SCHEMA_VERSION
      ? RESPONSE_FIELDS
      : [...RESPONSE_FIELDS, ...RESPONSE_DISPLAY_FIELDS];
    if (!validateExactFields(value, responseFields, '$', errors)) return result(errors);
    const catalog = readCatalog(options);

    validateSchemaVersion(value.schemaVersion, errors);
    validateRequestId(value.requestId, errors);
    if (typeof options.expectedRequestId === 'string' &&
        value.requestId !== options.expectedRequestId) {
      addError(errors, '$.requestId', 'request_id_mismatch', 'Response does not match the request.');
    }
    if (!GUIDE_RESPONSE_OUTCOMES.includes(value.outcome)) {
      addError(errors, '$.outcome', 'invalid_outcome', 'Unknown response outcome.');
    }
    validateBoundedString(value.answerText, '$.answerText', errors, {
      maximum: options.maxAnswerLength ?? MAX_GUIDE_ANSWER_LENGTH
    });
    validateFactReferences(value.factReferences, errors, catalog);
    validateNullableIdentifier(value.topicId, '$.topicId', errors, catalog.topicIds);
    validateNullableIdentifier(
      value.specialistNpcId,
      '$.specialistNpcId',
      errors,
      catalog.specialistNpcIds
    );
    validateNullableIdentifier(
      value.destinationZoneId,
      '$.destinationZoneId',
      errors,
      catalog.zoneIds
    );
    validateOptionalDisplayName(
      value,
      'specialistName',
      value.specialistNpcId,
      catalog.specialistNames,
      errors
    );
    validateOptionalDisplayName(
      value,
      'destinationZoneName',
      value.destinationZoneId,
      catalog.zoneNames,
      errors
    );

    if (value.canonicalDirections !== null) {
      validateBoundedString(value.canonicalDirections, '$.canonicalDirections', errors, {
        maximum: 500
      });
    }

    if (validateBoundedString(value.knowledgeVersion, '$.knowledgeVersion', errors, {
      maximum: 128,
      pattern: TOKEN_PATTERN
    }) && catalog.knowledgeVersions && !catalog.knowledgeVersions.has(value.knowledgeVersion)) {
      addError(
        errors,
        '$.knowledgeVersion',
        'unknown_knowledge_version',
        'Knowledge version is not recognized.'
      );
    }

    validateError(value.error, errors);
    validateResponseCombinations(value, errors);
    validateCanonicalData(value, errors, catalog);
  } catch {
    addError(errors, '$', 'malformed_data', 'Response could not be safely inspected.');
  }

  return result(errors);
}
