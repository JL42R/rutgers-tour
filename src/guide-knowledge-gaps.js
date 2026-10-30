const EVENT_FIELDS = Object.freeze([
  'knowledgeVersion',
  'category',
  'outcomeCode',
  'aggregateCount'
]);
const VALUE_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readValue(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 ||
      !VALUE_PATTERN.test(value)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
}

/**
 * Aggregate already-minimized synthetic gap counts. This creates no storage
 * and deliberately rejects questions, transcripts, identifiers, and free text.
 */
export function summarizeSyntheticKnowledgeGaps(events) {
  if (!Array.isArray(events) || events.length === 0 || events.length > 100) {
    throw new TypeError('Expected 1-100 minimized synthetic gap events.');
  }

  const totals = new Map();
  let aggregateCount = 0;
  for (const event of events) {
    if (!isRecord(event) || Object.keys(event).length !== EVENT_FIELDS.length ||
        Object.keys(event).some((field) => !EVENT_FIELDS.includes(field))) {
      throw new TypeError('Synthetic gap events contain disallowed fields.');
    }
    const knowledgeVersion = readValue(event.knowledgeVersion, 'knowledgeVersion');
    const category = readValue(event.category, 'category');
    const outcomeCode = readValue(event.outcomeCode, 'outcomeCode');
    if (!Number.isInteger(event.aggregateCount) || event.aggregateCount < 1 ||
        event.aggregateCount > 1000000) {
      throw new TypeError('aggregateCount is invalid.');
    }
    const key = `${knowledgeVersion}\u0000${category}\u0000${outcomeCode}`;
    totals.set(key, (totals.get(key) ?? 0) + event.aggregateCount);
    aggregateCount += event.aggregateCount;
  }

  const gaps = [...totals.entries()]
    .map(([key, count]) => {
      const [knowledgeVersion, category, outcomeCode] = key.split('\u0000');
      return Object.freeze({ knowledgeVersion, category, outcomeCode, aggregateCount: count });
    })
    .sort((left, right) => (
      right.aggregateCount - left.aggregateCount ||
      left.knowledgeVersion.localeCompare(right.knowledgeVersion) ||
      left.category.localeCompare(right.category) ||
      left.outcomeCode.localeCompare(right.outcomeCode)
    ));

  return Object.freeze({
    inputEventCount: events.length,
    aggregateCount,
    gaps: Object.freeze(gaps)
  });
}
