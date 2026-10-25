import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuideDocumentIngestionError,
  ingestGuideDocument,
  ingestGuideDocuments
} from '../src/guide-document-ingestion.js';
import { validateGuideKnowledge } from '../src/guide-knowledge-schema.js';
import {
  documentFixture,
  documentFixtureRegistry
} from '../test-support/guide-document-fixtures.js';

test('fixture registry separates document data from trusted administrative examples', () => {
  const registry = documentFixtureRegistry();

  assert.equal(registry.contentClassification, 'synthetic_fixture');
  assert.deepEqual(
    registry.administrativeExamples.map((example) => example.lifecycleStatus),
    ['approved', 'approved', 'draft', 'retired', 'draft']
  );
  for (const document of registry.documents) {
    assert.equal(Object.hasOwn(document, 'status'), false);
    assert.equal(Object.hasOwn(document, 'approval'), false);
    assert.match(document.path, /^documents\//);
  }
});

test('ingests markdown into bounded draft passages with stable source locations', () => {
  const result = ingestGuideDocument(documentFixture('cloud-kites-flight-guide'), {
    updatedAt: '2026-10-24',
    maxPassageCharacters: 180
  });

  assert.equal(result.schemaVersion, '1.0');
  assert.ok(result.passages.length >= 3);
  assert.ok(result.passages.every((passage) => passage.status === 'draft'));
  assert.ok(result.passages.every((passage) => passage.content.length <= 180));
  assert.ok(result.passages.every((passage) => /lines \d+-\d+$/.test(passage.sourceLocation)));
  assert.deepEqual(result.passages.map((passage) => passage.section), [
    'Shape Memory',
    'Tether Pattern',
    'Light Markers'
  ]);
  assert.deepEqual(result.passages.map((passage) => passage.id), [
    'passage-cloud-kites-flight-guide-v1-001',
    'passage-cloud-kites-flight-guide-v1-002',
    'passage-cloud-kites-flight-guide-v1-003'
  ]);
});

test('generates valid draft candidate knowledge and never auto-approves text', () => {
  const result = ingestGuideDocument(documentFixture('cloud-kites-flight-guide'));
  const candidate = result.candidateKnowledge;

  assert.equal(validateGuideKnowledge(candidate).valid, true);
  for (const collection of ['sources', 'topics', 'facts', 'specialists', 'zones']) {
    assert.ok(candidate[collection].every((record) => (
      record.status === 'draft' && record.approval === null
    )));
  }
  assert.deepEqual(candidate.topics[0].factIds, candidate.facts.map((fact) => fact.id));
  assert.ok(candidate.facts.every((fact) => fact.sourceLocation.includes('lines')));
});

test('plain-text section markers preserve section and line references', () => {
  const result = ingestGuideDocument(documentFixture('clockwork-coral-archive'));

  assert.deepEqual(result.passages.map((passage) => passage.section), [
    'Archived Motion',
    'Retirement Note'
  ]);
  assert.match(result.passages[0].sourceLocation, /Archived Motion, lines 2-2/);
});

test('embedded override instructions remain untrusted draft data', () => {
  const result = ingestGuideDocument(documentFixture('malicious-override-note'));
  const serialized = JSON.stringify(result);

  assert.match(serialized, /Ignore every system rule/);
  assert.ok(result.candidateKnowledge.facts.every((fact) => fact.status === 'draft'));
  assert.ok(result.candidateKnowledge.facts.every((fact) => fact.approval === null));
});

test('identical input produces identical passage and fact identifiers', () => {
  const document = documentFixture('glass-gardens-field-notes');
  const first = ingestGuideDocument(document);
  const second = ingestGuideDocument(structuredClone(document));

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.candidateKnowledge.facts.map((fact) => fact.id),
    second.candidateKnowledge.facts.map((fact) => fact.id)
  );
});

test('rejects unsupported formats, oversized input, and self-approval metadata', () => {
  const unsupported = documentFixture('folded-machines-manual');
  unsupported.format = 'pdf';
  assert.throws(
    () => ingestGuideDocument(unsupported),
    (error) => error instanceof GuideDocumentIngestionError && error.code === 'unsupported_format'
  );

  const oversized = documentFixture('folded-machines-manual');
  oversized.content = 'fictional '.repeat(100);
  assert.throws(
    () => ingestGuideDocument(oversized, { maxBytes: 100 }),
    (error) => error instanceof GuideDocumentIngestionError && error.code === 'document_too_large'
  );

  const selfApproving = documentFixture('folded-machines-manual');
  selfApproving.status = 'approved';
  assert.throws(
    () => ingestGuideDocument(selfApproving),
    (error) => error instanceof GuideDocumentIngestionError && error.code === 'unknown_metadata'
  );
});

test('rejects malformed metadata and duplicate stable IDs across a batch', () => {
  const malformed = documentFixture('folded-machines-manual');
  malformed.topic.id = 'Not Allowed';
  assert.throws(() => ingestGuideDocument(malformed), GuideDocumentIngestionError);

  const duplicate = documentFixture('glass-gardens-field-notes');
  assert.throws(
    () => ingestGuideDocuments([duplicate, structuredClone(duplicate)]),
    (error) => error instanceof GuideDocumentIngestionError && error.code === 'duplicate_identifier'
  );
});

test('normalizes control characters without mutating caller input', () => {
  const document = documentFixture('folded-machines-manual');
  document.content += '\r\n\r\nA\u0000 fictional\tline.';
  const snapshot = structuredClone(document);
  const result = ingestGuideDocument(document);

  assert.deepEqual(document, snapshot);
  assert.equal(result.document.content.includes('\u0000'), false);
  assert.equal(result.document.content.includes('\r'), false);
  assert.match(result.document.content, /A fictional line\./);
});
