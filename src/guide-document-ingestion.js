import { validateGuideKnowledge } from './guide-knowledge-schema.js';

export const GUIDE_DOCUMENT_INGESTION_SCHEMA_VERSION = '1.0';
export const GUIDE_DOCUMENT_FORMATS = Object.freeze(['markdown', 'text']);
export const DEFAULT_DOCUMENT_MAX_BYTES = 32768;
export const DEFAULT_PASSAGE_MAX_CHARACTERS = 600;

const DOCUMENT_FIELDS = Object.freeze([
  'id',
  'version',
  'format',
  'title',
  'sourceId',
  'sourceReference',
  'contentClassification',
  'topic',
  'specialist',
  'destinationZone',
  'content'
]);
const TOPIC_FIELDS = Object.freeze(['id', 'label', 'category']);
const SPECIALIST_FIELDS = Object.freeze(['id', 'name']);
const ZONE_FIELDS = Object.freeze(['id', 'name', 'canonicalDirections']);
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class GuideDocumentIngestionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GuideDocumentIngestionError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new GuideDocumentIngestionError(code, message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, fields, label) {
  if (!isRecord(value)) fail('invalid_metadata', `${label} must be an object.`);
  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail('unknown_metadata', `${label} contains an unsupported field: ${key}.`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) fail('missing_metadata', `${label} is missing ${key}.`);
  }
}

function boundedString(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    fail('invalid_metadata', `${label} must contain 1-${maximum} characters.`);
  }
  return value.trim();
}

function identifier(value, label) {
  const selected = boundedString(value, label, 64);
  if (!IDENTIFIER_PATTERN.test(selected)) {
    fail('invalid_metadata', `${label} must be a lowercase hyphenated identifier.`);
  }
  return selected;
}

function version(value) {
  const selected = boundedString(value, 'document.version', 64);
  if (!VERSION_PATTERN.test(selected)) fail('invalid_metadata', 'Document version is invalid.');
  return selected;
}

function configuredInteger(value, fallback, minimum, maximum, label) {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
    fail('invalid_configuration', `${label} is invalid.`);
  }
  return selected;
}

function normalizedContent(value) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('invalid_content', 'Document content must be a non-empty string.');
  }

  return value
    .replace(/\r\n?/g, '\n')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function documentMetadata(document) {
  exactFields(document, DOCUMENT_FIELDS, 'document');
  exactFields(document.topic, TOPIC_FIELDS, 'document.topic');
  if (document.specialist !== null) {
    exactFields(document.specialist, SPECIALIST_FIELDS, 'document.specialist');
  }
  if (document.destinationZone !== null) {
    exactFields(document.destinationZone, ZONE_FIELDS, 'document.destinationZone');
  }
  if ((document.specialist === null) !== (document.destinationZone === null)) {
    fail('invalid_metadata', 'A specialist and destination zone must be supplied together.');
  }

  const format = boundedString(document.format, 'document.format', 16).toLowerCase();
  if (!GUIDE_DOCUMENT_FORMATS.includes(format)) {
    fail('unsupported_format', `Unsupported document format: ${format}.`);
  }
  if (document.contentClassification !== 'synthetic_fixture') {
    fail('invalid_classification', 'Offline document fixtures must be classified synthetic_fixture.');
  }

  const metadata = {
    id: identifier(document.id, 'document.id'),
    version: version(document.version),
    format,
    title: boundedString(document.title, 'document.title', 200),
    sourceId: identifier(document.sourceId, 'document.sourceId'),
    sourceReference: boundedString(document.sourceReference, 'document.sourceReference', 500),
    contentClassification: document.contentClassification,
    topic: {
      id: identifier(document.topic.id, 'document.topic.id'),
      label: boundedString(document.topic.label, 'document.topic.label', 160),
      category: identifier(document.topic.category, 'document.topic.category')
    },
    specialist: null,
    destinationZone: null
  };

  if (document.specialist !== null) {
    metadata.specialist = {
      id: identifier(document.specialist.id, 'document.specialist.id'),
      name: boundedString(document.specialist.name, 'document.specialist.name', 160)
    };
    metadata.destinationZone = {
      id: identifier(document.destinationZone.id, 'document.destinationZone.id'),
      name: boundedString(document.destinationZone.name, 'document.destinationZone.name', 160),
      canonicalDirections: boundedString(
        document.destinationZone.canonicalDirections,
        'document.destinationZone.canonicalDirections',
        500
      )
    };
  }
  return metadata;
}

function headingFor(line, format) {
  if (format === 'markdown') {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    return match ? match[1].trim() : null;
  }
  const match = line.match(/^\[([^\]\n]{1,100})\]$/);
  return match ? match[1].trim() : null;
}

function paragraphRecords(content, format) {
  const lines = content.split('\n');
  const records = [];
  let section = 'Document body';
  let paragraph = [];
  let startLine = 1;

  const flush = (endLine) => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    if (text) records.push({ section, text, startLine, endLine });
    paragraph = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = headingFor(line, format);
    if (heading) {
      flush(lineNumber - 1);
      section = heading;
      return;
    }
    if (!line.trim()) {
      flush(lineNumber - 1);
      return;
    }
    if (paragraph.length === 0) startLine = lineNumber;
    paragraph.push(line.trim());
  });
  flush(lines.length);
  if (records.length === 0) fail('empty_document', 'Document contains no passage text.');
  return records;
}

function boundedChunks(text, maximum) {
  if (text.length <= maximum) return [text];
  const words = text.split(' ');
  const chunks = [];
  let current = '';

  for (const word of words) {
    if (word.length > maximum) fail('passage_too_large', 'A document token exceeds the passage limit.');
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maximum) {
      current = next;
      continue;
    }
    chunks.push(current);
    current = word;
  }
  if (current) chunks.push(current);
  return chunks;
}

function idVersion(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

function createPassages(metadata, content, maximum) {
  const suffix = idVersion(metadata.version);
  let ordinal = 0;
  const passages = [];
  for (const paragraph of paragraphRecords(content, metadata.format)) {
    for (const chunk of boundedChunks(paragraph.text, maximum)) {
      ordinal += 1;
      const number = String(ordinal).padStart(3, '0');
      passages.push(Object.freeze({
        id: `passage-${metadata.id}-v${suffix}-${number}`,
        documentId: metadata.id,
        documentVersion: metadata.version,
        section: paragraph.section,
        sourceId: metadata.sourceId,
        sourceLocation: `${paragraph.section}, lines ${paragraph.startLine}-${paragraph.endLine}`,
        content: chunk,
        contentClassification: metadata.contentClassification,
        status: 'draft',
        approval: null
      }));
    }
  }
  return Object.freeze(passages);
}

function createCandidateKnowledge(metadata, passages, updatedAt) {
  const specialistIds = metadata.specialist ? [metadata.specialist.id] : [];
  const zoneIds = metadata.destinationZone ? [metadata.destinationZone.id] : [];
  const facts = passages.map((passage, index) => freezeRecord({
    id: `fact-${metadata.id}-v${idVersion(metadata.version)}-${String(index + 1).padStart(3, '0')}`,
    topicId: metadata.topic.id,
    content: passage.content,
    sourceId: metadata.sourceId,
    sourceLocation: passage.sourceLocation,
    status: 'draft',
    recordVersion: 1,
    updatedAt,
    approval: null,
    relatedSpecialistIds: specialistIds,
    relatedDestinationZoneIds: zoneIds
  }));
  const sources = [freezeRecord({
    id: metadata.sourceId,
    title: metadata.title,
    reference: metadata.sourceReference,
    location: `Document ${metadata.id}, version ${metadata.version}`,
    status: 'draft',
    recordVersion: 1,
    updatedAt,
    approval: null
  })];
  const topics = [freezeRecord({
    id: metadata.topic.id,
    category: metadata.topic.category,
    label: metadata.topic.label,
    status: 'draft',
    recordVersion: 1,
    updatedAt,
    approval: null,
    factIds: facts.map((fact) => fact.id),
    specialistIds,
    destinationZoneIds: zoneIds
  })];
  const specialists = metadata.specialist ? [freezeRecord({
    id: metadata.specialist.id,
    name: metadata.specialist.name,
    status: 'draft',
    recordVersion: 1,
    updatedAt,
    approval: null,
    topicIds: [metadata.topic.id],
    destinationZoneId: metadata.destinationZone.id
  })] : [];
  const zones = metadata.destinationZone ? [freezeRecord({
    id: metadata.destinationZone.id,
    name: metadata.destinationZone.name,
    status: 'draft',
    recordVersion: 1,
    updatedAt,
    approval: null,
    canonicalDirections: metadata.destinationZone.canonicalDirections
  })] : [];

  const knowledge = Object.freeze({
    schemaVersion: '1.0',
    knowledgeVersion: `draft-${metadata.id}-v${idVersion(metadata.version)}`,
    contentClassification: metadata.contentClassification,
    sources: Object.freeze(sources),
    topics: Object.freeze(topics),
    facts: Object.freeze(facts),
    specialists: Object.freeze(specialists),
    zones: Object.freeze(zones)
  });
  if (!validateGuideKnowledge(knowledge).valid) {
    fail('invalid_candidates', 'Generated draft candidates failed knowledge validation.');
  }
  return knowledge;
}

/**
 * Deterministically turn one trusted fixture document into draft passages and
 * draft knowledge candidates. Text is always data; it can never set lifecycle state.
 */
export function ingestGuideDocument(document, options = {}) {
  const metadata = documentMetadata(document);
  const maxBytes = configuredInteger(
    options.maxBytes,
    DEFAULT_DOCUMENT_MAX_BYTES,
    1,
    131072,
    'maxBytes'
  );
  const maxPassageCharacters = configuredInteger(
    options.maxPassageCharacters,
    DEFAULT_PASSAGE_MAX_CHARACTERS,
    100,
    1500,
    'maxPassageCharacters'
  );
  const updatedAt = boundedString(options.updatedAt ?? '2026-10-24', 'updatedAt', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
    fail('invalid_configuration', 'updatedAt must use YYYY-MM-DD form.');
  }

  const content = normalizedContent(document.content);
  if (new TextEncoder().encode(content).byteLength > maxBytes) {
    fail('document_too_large', `Document exceeds the ${maxBytes}-byte limit.`);
  }
  const passages = createPassages(metadata, content, maxPassageCharacters);
  const candidateKnowledge = createCandidateKnowledge(metadata, passages, updatedAt);

  return Object.freeze({
    schemaVersion: GUIDE_DOCUMENT_INGESTION_SCHEMA_VERSION,
    document: freezeRecord({ ...metadata, content }),
    passages,
    candidateKnowledge
  });
}

/** Ingest a bounded collection and reject duplicate stable IDs across documents. */
export function ingestGuideDocuments(documents, options = {}) {
  if (!Array.isArray(documents) || documents.length === 0 || documents.length > 50) {
    fail('invalid_collection', 'Expected 1-50 documents.');
  }
  const ingestions = documents.map((document) => ingestGuideDocument(document, options));
  const seen = new Set();
  for (const ingestion of ingestions) {
    const ids = [
      `document:${ingestion.document.id}`,
      ...ingestion.passages.map((passage) => `passage:${passage.id}`)
    ];
    for (const collection of ['sources', 'topics', 'facts', 'specialists', 'zones']) {
      ids.push(...ingestion.candidateKnowledge[collection].map((record) => `${collection}:${record.id}`));
    }
    for (const id of ids) {
      if (seen.has(id)) fail('duplicate_identifier', `Duplicate stable ID: ${id}.`);
      seen.add(id);
    }
  }
  return Object.freeze({
    schemaVersion: GUIDE_DOCUMENT_INGESTION_SCHEMA_VERSION,
    ingestions: Object.freeze(ingestions)
  });
}
