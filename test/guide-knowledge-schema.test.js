import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createApprovedKnowledgeView,
  createKnowledgeCatalog,
  GUIDE_KNOWLEDGE_SCHEMA_VERSION,
  KNOWLEDGE_LIFECYCLE_STATUSES,
  validateGuideKnowledge
} from '../src/guide-knowledge-schema.js';

const fixtureUrl = new URL('../knowledge/core-guide.fixture.v1.json', import.meta.url);
const fixtureText = readFileSync(fixtureUrl, 'utf8');

function fixture() {
  return JSON.parse(fixtureText);
}

function errorCodes(validation) {
  return validation.errors.map((error) => error.code);
}

test('validates the fictional versioned knowledge fixture', () => {
  const knowledge = fixture();
  const validation = validateGuideKnowledge(knowledge);

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(knowledge.schemaVersion, GUIDE_KNOWLEDGE_SCHEMA_VERSION);
  assert.equal(knowledge.contentClassification, 'synthetic_fixture');
  assert.match(knowledge.knowledgeVersion, /^fictional-/);
});

test('defines one consistent lifecycle vocabulary', () => {
  assert.deepEqual(KNOWLEDGE_LIFECYCLE_STATUSES, [
    'draft',
    'in_review',
    'approved',
    'retired'
  ]);
});

test('authoritative view includes only approved records', () => {
  const approved = createApprovedKnowledgeView(fixture());

  assert.equal(approved.valid, true);
  for (const collection of ['sources', 'topics', 'facts', 'specialists', 'zones']) {
    assert.ok(approved.knowledge[collection].every((record) => record.status === 'approved'));
  }
  assert.deepEqual(approved.knowledge.facts.map((record) => record.id), [
    'fact-folded-machines-motion'
  ]);
});

test('draft records are excluded from authoritative knowledge', () => {
  const approved = createApprovedKnowledgeView(fixture()).knowledge;
  assert.equal(approved.topics.some((record) => record.id === 'cloud-kites'), false);
  assert.equal(approved.facts.some((record) => record.id === 'fact-cloud-kites-color'), false);
});

test('in-review records are excluded from authoritative knowledge', () => {
  const approved = createApprovedKnowledgeView(fixture()).knowledge;
  assert.equal(approved.topics.some((record) => record.id === 'glass-gardens'), false);
  assert.equal(approved.facts.some((record) => record.id === 'fact-glass-gardens-light'), false);
});

test('retired records are excluded from authoritative knowledge', () => {
  const approved = createApprovedKnowledgeView(fixture()).knowledge;
  assert.equal(approved.topics.some((record) => record.id === 'clockwork-coral'), false);
  assert.equal(approved.facts.some((record) => record.id === 'fact-clockwork-coral-motion'), false);
});

test('creates an API catalog from approved records only', () => {
  const result = createKnowledgeCatalog(fixture());

  assert.equal(result.valid, true);
  assert.deepEqual(result.catalog, {
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
        canonicalDirections: 'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.'
      }
    },
    zoneDirections: {
      'zone-imaginary-workshop': 'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.'
    }
  });
});

test('rejects duplicate topic IDs', () => {
  const knowledge = fixture();
  knowledge.topics.push(structuredClone(knowledge.topics[0]));

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('duplicate_identifier'));
});

test('rejects duplicate fact IDs', () => {
  const knowledge = fixture();
  knowledge.facts.push(structuredClone(knowledge.facts[0]));

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('duplicate_identifier'));
});

test('rejects unknown topic IDs in fact records', () => {
  const knowledge = fixture();
  knowledge.facts[0].topicId = 'invented-topic';

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('unknown_reference'));
});

test('rejects topic-to-fact relationships that disagree', () => {
  const knowledge = fixture();
  knowledge.facts[0].topicId = 'cloud-kites';

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('topic_mismatch'));
});

test('rejects unknown specialist IDs', () => {
  const knowledge = fixture();
  knowledge.topics[0].specialistIds = ['npc-invented'];

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('unknown_reference'));
});

test('rejects unknown destination zone IDs', () => {
  const knowledge = fixture();
  knowledge.facts[0].relatedDestinationZoneIds = ['zone-invented'];

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('unknown_reference'));
});

test('rejects invalid source references', () => {
  const knowledge = fixture();
  knowledge.facts[0].sourceId = 'source-invented';

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('unknown_reference'));
});

test('approved facts cannot depend on unapproved sources', () => {
  const knowledge = fixture();
  knowledge.sources[0].status = 'draft';
  knowledge.sources[0].approval = null;

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('unapproved_reference'));
});

test('approved records require approval metadata', () => {
  const knowledge = fixture();
  knowledge.facts[0].approval = null;

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('missing_approval'));
});

test('rejects incomplete approval metadata', () => {
  const knowledge = fixture();
  delete knowledge.facts[0].approval.reference;

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('missing_property'));
});

test('rejects invalid canonical directions', () => {
  const knowledge = fixture();
  knowledge.zones[0].canonicalDirections = '';

  const codes = errorCodes(validateGuideKnowledge(knowledge));
  assert.ok(codes.includes('invalid_length'));
  assert.ok(codes.includes('missing_canonical_directions'));
});

test('approved specialists cannot route to unapproved destination data', () => {
  const knowledge = fixture();
  knowledge.zones[0].status = 'draft';
  knowledge.zones[0].approval = null;

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('unapproved_reference'));
});

test('rejects incompatible schema versions', () => {
  const knowledge = fixture();
  knowledge.schemaVersion = '2.0';

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes(
    'unsupported_schema_version'
  ));
});

test('rejects unknown lifecycle values', () => {
  const knowledge = fixture();
  knowledge.facts[0].status = 'visitor_claimed';

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('invalid_status'));
});

test('rejects unknown knowledge properties', () => {
  const knowledge = fixture();
  knowledge.facts[0].modelPrompt = 'Provider-specific instructions do not belong here.';

  assert.ok(errorCodes(validateGuideKnowledge(knowledge)).includes('unknown_property'));
});

test('new draft knowledge can be added without changing validator or engine code', () => {
  const knowledge = fixture();
  knowledge.sources.push({
    id: 'source-paper-comet-notes',
    title: 'Fictional Paper Comet Draft Notes',
    reference: 'fixture://paper-comet-notes',
    location: null,
    status: 'draft',
    recordVersion: 1,
    updatedAt: '2026-10-22',
    approval: null
  });
  knowledge.topics.push({
    id: 'paper-comets',
    category: 'fictional-demonstrations',
    label: 'Fictional paper comets',
    status: 'draft',
    recordVersion: 1,
    updatedAt: '2026-10-22',
    approval: null,
    factIds: ['fact-paper-comets-tail'],
    specialistIds: [],
    destinationZoneIds: []
  });
  knowledge.facts.push({
    id: 'fact-paper-comets-tail',
    topicId: 'paper-comets',
    content: 'This fictional draft describes a paper comet with a ribbon tail.',
    sourceId: 'source-paper-comet-notes',
    sourceLocation: null,
    status: 'draft',
    recordVersion: 1,
    updatedAt: '2026-10-22',
    approval: null,
    relatedSpecialistIds: [],
    relatedDestinationZoneIds: []
  });

  const validation = validateGuideKnowledge(knowledge);
  const approved = createApprovedKnowledgeView(knowledge);
  assert.equal(validation.valid, true);
  assert.equal(approved.knowledge.topics.some((record) => record.id === 'paper-comets'), false);
});

test('the synthetic fixture contains no Rutgers CORE production claims', () => {
  const knowledge = fixture();
  const serialized = JSON.stringify(knowledge).toLowerCase();

  assert.equal(knowledge.contentClassification, 'synthetic_fixture');
  assert.equal(serialized.includes('rutgers'), false);
  assert.equal(serialized.includes('core building'), false);
  assert.ok(knowledge.facts.every((fact) => fact.content.toLowerCase().includes('fictional')));
});

test('schema validation does not claim that answer prose is factually grounded', () => {
  const knowledge = fixture();
  knowledge.facts[0].content = 'This fictional sentence is structurally valid but still needs review.';

  assert.equal(validateGuideKnowledge(knowledge).valid, true);
});

test('malformed knowledge fails closed without throwing', () => {
  for (const value of [null, [], 'knowledge', 42]) {
    assert.equal(validateGuideKnowledge(value).valid, false);
  }

  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error('Synthetic hostile knowledge');
    }
  });
  assert.equal(validateGuideKnowledge(hostile).valid, false);
});

test('validation and approved-view creation do not mutate source knowledge', () => {
  const knowledge = fixture();
  const snapshot = JSON.stringify(knowledge);

  validateGuideKnowledge(knowledge);
  createApprovedKnowledgeView(knowledge);

  assert.equal(JSON.stringify(knowledge), snapshot);
});
