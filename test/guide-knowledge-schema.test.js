import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createApprovedKnowledgeView,
  createKnowledgeCatalog,
  GUIDE_KNOWLEDGE_SCHEMA_VERSION,
  isKnowledgeLifecycleTransitionAllowed,
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
    'fact-folded-machines-motion',
    'fact-glass-gardens-light',
    'fact-glass-gardens-patterns'
  ]);
});

test('draft records are excluded from authoritative knowledge', () => {
  const approved = createApprovedKnowledgeView(fixture()).knowledge;
  assert.equal(approved.topics.some((record) => record.id === 'cloud-kites'), false);
  assert.equal(approved.facts.some((record) => record.id === 'fact-cloud-kites-color'), false);
});

test('in-review records are excluded from authoritative knowledge', () => {
  const knowledge = fixture();
  const source = knowledge.sources.find((record) => record.id === 'source-cloud-kite-notes');
  const topic = knowledge.topics.find((record) => record.id === 'cloud-kites');
  const fact = knowledge.facts.find((record) => record.id === 'fact-cloud-kites-color');
  for (const record of [source, topic, fact]) {
    record.status = 'in_review';
    record.recordVersion += 1;
  }

  const approved = createApprovedKnowledgeView(knowledge).knowledge;
  assert.equal(approved.topics.some((record) => record.id === 'cloud-kites'), false);
  assert.equal(approved.facts.some((record) => record.id === 'fact-cloud-kites-color'), false);
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
    topicIds: ['folded-machines', 'glass-gardens'],
    specialistNpcIds: ['npc-folded-machines-guide', 'npc-glass-gardens-guide'],
    zoneIds: ['zone-imaginary-workshop', 'zone-prism-conservatory'],
    factIds: [
      'fact-folded-machines-motion',
      'fact-glass-gardens-light',
      'fact-glass-gardens-patterns'
    ],
    sourceIds: ['source-folded-machines-handbook', 'source-glass-garden-notes'],
    knowledgeVersions: ['fictional-2026-10-23.2'],
    factSourceIds: {
      'fact-folded-machines-motion': 'source-folded-machines-handbook',
      'fact-glass-gardens-light': 'source-glass-garden-notes',
      'fact-glass-gardens-patterns': 'source-glass-garden-notes'
    },
    specialistRoutes: {
      'npc-folded-machines-guide': {
        destinationZoneId: 'zone-imaginary-workshop',
        specialistName: 'Fictional Folded Machines Guide',
        destinationZoneName: 'Fictional Imaginary Workshop',
        canonicalDirections: 'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.'
      },
      'npc-glass-gardens-guide': {
        destinationZoneId: 'zone-prism-conservatory',
        specialistName: 'Fictional Glass Gardens Guide',
        destinationZoneName: 'Fictional Prism Conservatory',
        canonicalDirections: 'From the fictional guide marker, follow the violet glass tiles to the prism conservatory.'
      }
    },
    specialistNames: {
      'npc-folded-machines-guide': 'Fictional Folded Machines Guide',
      'npc-glass-gardens-guide': 'Fictional Glass Gardens Guide'
    },
    zoneNames: {
      'zone-imaginary-workshop': 'Fictional Imaginary Workshop',
      'zone-prism-conservatory': 'Fictional Prism Conservatory'
    },
    zoneDirections: {
      'zone-imaginary-workshop': 'From the fictional guide marker, follow the silver paper arrows to the imaginary workshop.',
      'zone-prism-conservatory': 'From the fictional guide marker, follow the violet glass tiles to the prism conservatory.'
    }
  });
});

test('a fact becomes retrievable only after the reviewed lifecycle and disappears when retired', () => {
  const knowledge = fixture();
  const factId = 'fact-folded-machines-fold-count';
  const topic = knowledge.topics.find((record) => record.id === 'folded-machines');
  const fact = {
    ...structuredClone(knowledge.facts[0]),
    id: factId,
    content: 'In this fictional fixture, a fold counter records each paper hinge movement.',
    status: 'draft',
    recordVersion: 1,
    updatedAt: '2026-10-24',
    approval: null
  };
  knowledge.facts.push(fact);

  assert.equal(validateGuideKnowledge(knowledge).valid, true);
  assert.equal(createApprovedKnowledgeView(knowledge).knowledge.facts.some(
    (record) => record.id === factId
  ), false);

  assert.equal(isKnowledgeLifecycleTransitionAllowed('draft', 'in_review'), true);
  fact.status = 'in_review';
  fact.recordVersion = 2;
  assert.equal(validateGuideKnowledge(knowledge).valid, true);
  assert.equal(createApprovedKnowledgeView(knowledge).knowledge.facts.some(
    (record) => record.id === factId
  ), false);

  fact.approval = {
    reviewedBy: 'synthetic-fixture-reviewer',
    reference: 'fixture-review-lifecycle-001',
    reviewedAt: '2026-10-24'
  };
  assert.equal(validateGuideKnowledge(knowledge).valid, true);

  assert.equal(isKnowledgeLifecycleTransitionAllowed('in_review', 'approved'), true);
  fact.status = 'approved';
  fact.recordVersion = 3;
  topic.factIds.push(factId);
  knowledge.knowledgeVersion = 'fictional-lifecycle-2';
  assert.equal(validateGuideKnowledge(knowledge).valid, true);
  assert.ok(createApprovedKnowledgeView(knowledge).knowledge.facts.some(
    (record) => record.id === factId
  ));
  assert.deepEqual(createKnowledgeCatalog(knowledge).catalog.knowledgeVersions, [
    'fictional-lifecycle-2'
  ]);

  assert.equal(isKnowledgeLifecycleTransitionAllowed('approved', 'retired'), true);
  fact.status = 'retired';
  fact.recordVersion = 4;
  fact.approval = {
    reviewedBy: 'synthetic-fixture-reviewer',
    reference: 'fixture-retirement-lifecycle-001',
    reviewedAt: '2026-10-24'
  };
  topic.factIds = topic.factIds.filter((id) => id !== factId);
  knowledge.knowledgeVersion = 'fictional-lifecycle-3';
  assert.equal(validateGuideKnowledge(knowledge).valid, true);
  assert.equal(createApprovedKnowledgeView(knowledge).knowledge.facts.some(
    (record) => record.id === factId
  ), false);
});

test('rejects skipped or reversed lifecycle transitions', () => {
  assert.equal(isKnowledgeLifecycleTransitionAllowed('draft', 'approved'), false);
  assert.equal(isKnowledgeLifecycleTransitionAllowed('approved', 'in_review'), false);
  assert.equal(isKnowledgeLifecycleTransitionAllowed('retired', 'approved'), false);
  assert.equal(isKnowledgeLifecycleTransitionAllowed('visitor_claimed', 'approved'), false);
});

test('unknown and inherited lifecycle names fail closed without throwing', () => {
  for (const previousStatus of ['constructor', 'toString', '__proto__', null, undefined, {}, []]) {
    assert.equal(isKnowledgeLifecycleTransitionAllowed(previousStatus, 'approved'), false);
  }
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
