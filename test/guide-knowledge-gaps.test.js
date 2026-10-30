import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSyntheticKnowledgeGaps } from '../src/guide-knowledge-gaps.js';

test('aggregates only minimized synthetic knowledge-gap fields', () => {
  const summary = summarizeSyntheticKnowledgeGaps([
    {
      knowledgeVersion: 'fictional-gap-1',
      category: 'weather',
      outcomeCode: 'unsupported',
      aggregateCount: 3
    },
    {
      knowledgeVersion: 'fictional-gap-1',
      category: 'weather',
      outcomeCode: 'unsupported',
      aggregateCount: 2
    },
    {
      knowledgeVersion: 'fictional-gap-1',
      category: 'overlapping-topics',
      outcomeCode: 'ambiguous',
      aggregateCount: 1
    }
  ]);

  assert.equal(summary.inputEventCount, 3);
  assert.equal(summary.aggregateCount, 6);
  assert.deepEqual(summary.gaps, [
    {
      knowledgeVersion: 'fictional-gap-1',
      category: 'weather',
      outcomeCode: 'unsupported',
      aggregateCount: 5
    },
    {
      knowledgeVersion: 'fictional-gap-1',
      category: 'overlapping-topics',
      outcomeCode: 'ambiguous',
      aggregateCount: 1
    }
  ]);
});

test('rejects questions, transcripts, visitor identifiers, and personal data fields', () => {
  const base = {
    knowledgeVersion: 'fictional-gap-1',
    category: 'weather',
    outcomeCode: 'unsupported',
    aggregateCount: 1
  };
  for (const [field, value] of [
    ['question', 'What is the weather?'],
    ['transcript', ['visitor', 'guide']],
    ['ipAddress', '127.0.0.1'],
    ['visitorId', 'visitor-1'],
    ['email', 'fictional@example.test']
  ]) {
    assert.throws(
      () => summarizeSyntheticKnowledgeGaps([{ ...base, [field]: value }]),
      /disallowed fields/
    );
  }
});

test('rejects malformed aggregate counts and free-form values', () => {
  assert.throws(() => summarizeSyntheticKnowledgeGaps([{
    knowledgeVersion: 'fictional gap with spaces',
    category: 'weather',
    outcomeCode: 'unsupported',
    aggregateCount: 1
  }]), /knowledgeVersion/);
  assert.throws(() => summarizeSyntheticKnowledgeGaps([{
    knowledgeVersion: 'fictional-gap-1',
    category: 'weather',
    outcomeCode: 'unsupported',
    aggregateCount: 0
  }]), /aggregateCount/);
});
