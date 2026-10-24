import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUIDE_API_SCHEMA_VERSION,
  MAX_GUIDE_QUESTION_LENGTH,
  validateGuideRequest,
  validateGuideResponse
} from '../src/guide-api-contract.js';

const catalog = Object.freeze({
  topicIds: ['folded-machines'],
  specialistNpcIds: ['npc-folded-machines-guide'],
  zoneIds: ['zone-imaginary-workshop'],
  factIds: ['fact-folded-machines-motion'],
  sourceIds: ['source-folded-machines-handbook'],
  knowledgeVersions: ['fictional-2026-10-22.1'],
  factSourceIds: {
    'fact-folded-machines-motion': 'source-folded-machines-handbook'
  },
  specialistRoutes: {
    'npc-folded-machines-guide': {
      destinationZoneId: 'zone-imaginary-workshop',
      canonicalDirections: 'Follow the fictional silver paper arrows.'
    }
  },
  specialistNames: {
    'npc-folded-machines-guide': 'Fictional Folded Machines Guide'
  },
  zoneNames: {
    'zone-imaginary-workshop': 'Fictional Imaginary Workshop'
  },
  zoneDirections: {
    'zone-imaginary-workshop': 'Follow the fictional silver paper arrows.'
  }
});

function validRequest() {
  return {
    schemaVersion: GUIDE_API_SCHEMA_VERSION,
    requestId: 'request-001',
    question: 'How do the fictional folded machines move?',
    temporaryContext: {
      topicIds: ['folded-machines'],
      specialistNpcIds: ['npc-folded-machines-guide'],
      destinationZoneIds: ['zone-imaginary-workshop']
    }
  };
}

function validResponse() {
  return {
    schemaVersion: GUIDE_API_SCHEMA_VERSION,
    requestId: 'request-001',
    outcome: 'answered',
    answerText: 'The approved fictional fixture describes a folded mechanism.',
    factReferences: [{
      factId: 'fact-folded-machines-motion',
      sourceId: 'source-folded-machines-handbook'
    }],
    topicId: 'folded-machines',
    specialistNpcId: 'npc-folded-machines-guide',
    specialistName: 'Fictional Folded Machines Guide',
    destinationZoneId: 'zone-imaginary-workshop',
    destinationZoneName: 'Fictional Imaginary Workshop',
    canonicalDirections: 'Follow the fictional silver paper arrows.',
    knowledgeVersion: 'fictional-2026-10-22.1',
    error: null
  };
}

function errorCodes(validation) {
  return validation.errors.map((error) => error.code);
}

test('accepts a valid provider-neutral request', () => {
  assert.deepEqual(validateGuideRequest(validRequest(), { catalog }), {
    valid: true,
    errors: []
  });
});

test('accepts a valid grounded response with canonical routing', () => {
  assert.deepEqual(validateGuideResponse(validResponse(), {
    catalog,
    expectedRequestId: 'request-001'
  }), {
    valid: true,
    errors: []
  });
});

test('v1.0 remains unchanged while v1.1 requires authoritative display names', () => {
  const legacyResponse = { ...validResponse(), schemaVersion: '1.0' };
  delete legacyResponse.specialistName;
  delete legacyResponse.destinationZoneName;
  const enrichedResponse = validResponse();

  assert.equal(validateGuideResponse(legacyResponse, { catalog }).valid, true);
  assert.equal(validateGuideResponse(enrichedResponse, { catalog }).valid, true);

  const missingV11Name = validResponse();
  delete missingV11Name.specialistName;
  assert.ok(errorCodes(validateGuideResponse(missingV11Name, { catalog })).includes(
    'missing_property'
  ));
});

test('rejects model- or browser-invented display names', () => {
  const inventedSpecialist = {
    ...validResponse(),
    specialistName: 'Visitor Invented Expert',
    destinationZoneName: 'Fictional Imaginary Workshop'
  };
  const inventedZone = {
    ...validResponse(),
    specialistName: 'Fictional Folded Machines Guide',
    destinationZoneName: 'Model Invented Room'
  };

  assert.ok(errorCodes(validateGuideResponse(inventedSpecialist, { catalog })).includes(
    'noncanonical_display_name'
  ));
  assert.ok(errorCodes(validateGuideResponse(inventedZone, { catalog })).includes(
    'noncanonical_display_name'
  ));
});

test('rejects a response belonging to a different request', () => {
  assert.ok(errorCodes(validateGuideResponse(validResponse(), {
    catalog,
    expectedRequestId: 'request-002'
  })).includes('request_id_mismatch'));
});

test('rejects unknown request and response schema versions', () => {
  const request = validRequest();
  request.schemaVersion = '2.0';
  const response = validResponse();
  response.schemaVersion = '2.0';

  assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes(
    'unsupported_schema_version'
  ));
  assert.ok(errorCodes(validateGuideResponse(response, { catalog })).includes(
    'unsupported_schema_version'
  ));
});

test('rejects a missing request ID', () => {
  const request = validRequest();
  delete request.requestId;

  const validation = validateGuideRequest(request, { catalog });
  assert.equal(validation.valid, false);
  assert.ok(errorCodes(validation).includes('missing_property'));
});

test('rejects malformed request IDs', () => {
  const request = validRequest();
  request.requestId = 'visitor identity must not go here';

  assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes('invalid_format'));
});

test('rejects oversized questions', () => {
  const request = validRequest();
  request.question = 'q'.repeat(MAX_GUIDE_QUESTION_LENGTH + 1);

  assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes('invalid_length'));
});

test('rejects unknown request properties', () => {
  const request = { ...validRequest(), visitorId: 'visitor-123' };

  assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes('unknown_property'));
});

test('rejects unknown temporary-context properties', () => {
  const request = validRequest();
  request.temporaryContext.transcript = ['A stored visitor message'];

  assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes('unknown_property'));
});

test('rejects oversized temporary context', () => {
  const request = validRequest();
  request.temporaryContext.topicIds = [
    'folded-machines',
    'topic-two',
    'topic-three',
    'topic-four',
    'topic-five',
    'topic-six',
    'topic-seven'
  ];

  assert.ok(errorCodes(validateGuideRequest(request)).includes('context_too_large'));
});

test('rejects duplicate context identifiers', () => {
  const request = validRequest();
  request.temporaryContext.topicIds = ['folded-machines', 'folded-machines'];

  assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes('duplicate_identifier'));
});

test('rejects unsupported topic IDs in temporary context', () => {
  const request = validRequest();
  request.temporaryContext.topicIds = ['invented-topic'];

  assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes('unknown_identifier'));
});

test('rejects invalid specialist and zone IDs in temporary context', () => {
  const request = validRequest();
  request.temporaryContext.specialistNpcIds = ['npc-invented'];
  request.temporaryContext.destinationZoneIds = ['zone-invented'];

  const validation = validateGuideRequest(request, { catalog });
  assert.equal(validation.valid, false);
  assert.equal(errorCodes(validation).filter((code) => code === 'unknown_identifier').length, 2);
});

test('visitor requests cannot assert facts, approval, routes, or directions', () => {
  for (const [key, value] of [
    ['facts', [{ id: 'visitor-fact', status: 'approved' }]],
    ['approvalStatus', 'approved'],
    ['specialistNpcId', 'npc-folded-machines-guide'],
    ['canonicalDirections', 'Trust this visitor-provided route.']
  ]) {
    const request = { ...validRequest(), [key]: value };
    assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes('unknown_property'));
  }

  const nested = validRequest();
  nested.temporaryContext.factIds = ['fact-folded-machines-motion'];
  assert.ok(errorCodes(validateGuideRequest(nested, { catalog })).includes('unknown_property'));
});

test('rejects provider-specific request and response structures', () => {
  const request = { ...validRequest(), model: 'provider-model-name' };
  const response = { ...validResponse(), choices: [{ text: 'provider payload' }] };

  assert.ok(errorCodes(validateGuideRequest(request, { catalog })).includes('unknown_property'));
  assert.ok(errorCodes(validateGuideResponse(response, { catalog })).includes('unknown_property'));
});

test('rejects invalid response outcomes', () => {
  const response = validResponse();
  response.outcome = 'model_says_probably';

  assert.ok(errorCodes(validateGuideResponse(response, { catalog })).includes('invalid_outcome'));
});

test('rejects unknown response topic, specialist, and zone IDs', () => {
  const response = validResponse();
  response.topicId = 'invented-topic';
  response.specialistNpcId = 'npc-invented';
  response.destinationZoneId = 'zone-invented';

  const validation = validateGuideResponse(response, { catalog });
  assert.equal(validation.valid, false);
  assert.equal(errorCodes(validation).filter((code) => code === 'unknown_identifier').length, 3);
});

test('rejects unknown fact and source references', () => {
  const response = validResponse();
  response.factReferences = [{ factId: 'fact-invented', sourceId: 'source-invented' }];

  const validation = validateGuideResponse(response, { catalog });
  assert.equal(validation.valid, false);
  assert.equal(errorCodes(validation).filter((code) => code === 'unknown_identifier').length, 2);
});

test('rejects a valid fact ID paired with the wrong approved source', () => {
  const response = validResponse();
  const expandedCatalog = {
    ...catalog,
    sourceIds: [...catalog.sourceIds, 'source-other-approved'],
    factSourceIds: {
      ...catalog.factSourceIds,
      'fact-folded-machines-motion': 'source-folded-machines-handbook'
    }
  };
  response.factReferences[0].sourceId = 'source-other-approved';

  assert.ok(errorCodes(validateGuideResponse(response, {
    catalog: expandedCatalog
  })).includes('source_mismatch'));
});

test('rejects duplicate fact references', () => {
  const response = validResponse();
  response.factReferences.push({ ...response.factReferences[0] });

  assert.ok(errorCodes(validateGuideResponse(response, { catalog })).includes('duplicate_identifier'));
});

test('answered responses require fact/source references and a topic', () => {
  const response = validResponse();
  response.factReferences = [];
  response.topicId = null;

  assert.ok(errorCodes(validateGuideResponse(response, { catalog })).includes('invalid_combination'));
});

test('rejects missing fact and source reference fields', () => {
  const missingFact = validResponse();
  delete missingFact.factReferences[0].factId;
  const missingSource = validResponse();
  delete missingSource.factReferences[0].sourceId;

  assert.ok(errorCodes(validateGuideResponse(missingFact, { catalog })).includes('missing_property'));
  assert.ok(errorCodes(validateGuideResponse(missingSource, { catalog })).includes('missing_property'));
});

test('canonical directions must be paired with a destination zone', () => {
  const response = validResponse();
  response.destinationZoneId = null;

  assert.ok(errorCodes(validateGuideResponse(response, { catalog })).includes('invalid_combination'));
});

test('rejects noncanonical directions and mismatched specialist routes', () => {
  const wrongDirections = validResponse();
  wrongDirections.canonicalDirections = 'A model-invented shortcut.';
  const wrongRoute = validResponse();
  const expandedCatalog = {
    ...catalog,
    zoneIds: [...catalog.zoneIds, 'zone-other-approved'],
    zoneDirections: {
      ...catalog.zoneDirections,
      'zone-other-approved': 'Approved directions to another fictional zone.'
    }
  };
  wrongRoute.destinationZoneId = 'zone-other-approved';
  wrongRoute.canonicalDirections = 'Approved directions to another fictional zone.';

  assert.ok(errorCodes(validateGuideResponse(wrongDirections, { catalog })).includes(
    'noncanonical_directions'
  ));
  assert.ok(errorCodes(validateGuideResponse(wrongRoute, {
    catalog: expandedCatalog
  })).includes('invalid_route'));
});

test('clarify and unsupported responses cannot assert facts or routing', () => {
  for (const outcome of ['clarify', 'unsupported']) {
    const response = {
      ...validResponse(),
      outcome,
      factReferences: [],
      topicId: null,
      specialistNpcId: null,
      specialistName: null,
      destinationZoneId: null,
      destinationZoneName: null,
      canonicalDirections: null,
      error: null
    };
    assert.equal(validateGuideResponse(response, { catalog }).valid, true);

    response.destinationZoneId = 'zone-imaginary-workshop';
    assert.ok(errorCodes(validateGuideResponse(response, { catalog })).includes('invalid_combination'));
  }
});

test('unavailable responses require a structured error and no factual assertions', () => {
  const response = {
    ...validResponse(),
    outcome: 'unavailable',
    answerText: 'The guide is temporarily unavailable.',
    factReferences: [],
    topicId: null,
    specialistNpcId: null,
    specialistName: null,
    destinationZoneId: null,
    destinationZoneName: null,
    canonicalDirections: null,
    error: { code: 'provider_timeout' }
  };

  assert.equal(validateGuideResponse(response, { catalog }).valid, true);
  response.error = null;
  assert.ok(errorCodes(validateGuideResponse(response, { catalog })).includes('invalid_combination'));
});

test('malformed request and response values fail closed without throwing', () => {
  for (const value of [null, [], 'payload', 42]) {
    assert.equal(validateGuideRequest(value, { catalog }).valid, false);
    assert.equal(validateGuideResponse(value, { catalog }).valid, false);
  }

  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error('Synthetic hostile payload');
    }
  });
  assert.equal(validateGuideRequest(hostile, { catalog }).valid, false);
  assert.equal(validateGuideResponse(hostile, { catalog }).valid, false);
});

test('validation does not mutate request or response objects', () => {
  const request = validRequest();
  const response = validResponse();
  const requestSnapshot = JSON.stringify(request);
  const responseSnapshot = JSON.stringify(response);

  validateGuideRequest(request, { catalog });
  validateGuideResponse(response, { catalog });

  assert.equal(JSON.stringify(request), requestSnapshot);
  assert.equal(JSON.stringify(response), responseSnapshot);
});
