import test from 'node:test';
import assert from 'node:assert/strict';

import { matchQuestion, normalizeQuestion } from '../src/guide-qa.js';

const TOPICS = [
  {
    id: 'clockwork-gallery',
    status: 'verified',
    type: 'answer',
    response: 'The fictional Clockwork Gallery is described by this synthetic fixture.',
    phrases: [
      { text: 'clockwork gallery', weight: 5 },
      { text: 'opening hours', weight: 4 },
      { text: 'when are you open', weight: 4 }
    ],
    keywords: [
      { text: 'clockwork', weight: 2 },
      { text: 'hours', weight: 2 },
      'open'
    ]
  },
  {
    id: 'paper-robots',
    status: 'verified',
    type: 'route',
    response: 'Visit the fictional paper-robot specialist in the model workshop.',
    destinationNpcId: 'npc-paper-specialist',
    destinationZoneId: 'zone-model-workshop',
    phrases: [{ text: 'paper robots', weight: 6 }],
    keywords: ['paper', { text: 'robots', weight: 2 }]
  }
];

test('normalizeQuestion normalizes capitalization, punctuation, and whitespace', () => {
  assert.equal(
    normalizeQuestion('  WHAT... is\tThe Clockwork-Gallery?!  '),
    'what is the clockwork gallery'
  );
});

test('normalizeQuestion returns an empty string for non-string input', () => {
  assert.equal(normalizeQuestion(null), '');
  assert.equal(normalizeQuestion(47), '');
});

test('capitalization variations produce the same direct answer', () => {
  const lower = matchQuestion('when are you open', TOPICS);
  const upper = matchQuestion('WHEN ARE YOU OPEN', TOPICS);

  assert.deepEqual(upper, lower);
  assert.equal(lower.type, 'answer');
  assert.equal(lower.topicId, 'clockwork-gallery');
});

test('punctuation variations do not change a match', () => {
  assert.deepEqual(
    matchQuestion('What are your opening hours?', TOPICS),
    matchQuestion('What are your opening hours!!!', TOPICS)
  );
});

test('multiword phrases match across normalized punctuation', () => {
  const result = matchQuestion('Could I see the PAPER-ROBOTS?', TOPICS);

  assert.equal(result.type, 'route');
  assert.equal(result.topicId, 'paper-robots');
  assert.equal(result.score, 9);
});

test('returns a direct answer for a supported verified topic', () => {
  assert.deepEqual(matchQuestion('Tell me about the clockwork gallery.', TOPICS), {
    type: 'answer',
    topicId: 'clockwork-gallery',
    response: 'The fictional Clockwork Gallery is described by this synthetic fixture.',
    score: 7
  });
});

test('returns valid specialist routing data', () => {
  assert.deepEqual(matchQuestion('Who knows about paper robots?', TOPICS), {
    type: 'route',
    topicId: 'paper-robots',
    response: 'Visit the fictional paper-robot specialist in the model workshop.',
    destinationNpcId: 'npc-paper-specialist',
    destinationZoneId: 'zone-model-workshop',
    score: 9
  });
});

test('weighted terms select the stronger topic match', () => {
  const topics = [
    {
      id: 'silver-kites',
      status: 'verified',
      type: 'answer',
      response: 'Synthetic silver-kite answer.',
      phrases: [{ text: 'silver kites', weight: 6 }],
      keywords: ['display']
    },
    {
      id: 'display-cases',
      status: 'verified',
      type: 'answer',
      response: 'Synthetic display-case answer.',
      keywords: [{ text: 'display', weight: 2 }]
    }
  ];

  const result = matchQuestion('Where is the silver-kites display?', topics);
  assert.equal(result.topicId, 'silver-kites');
  assert.equal(result.score, 7);
});

test('duplicate phrases contribute to a score only once', () => {
  const topics = [{
    id: 'echo-gallery',
    status: 'verified',
    type: 'answer',
    response: 'Synthetic echo-gallery answer.',
    phrases: ['echo gallery', 'echo gallery']
  }];

  assert.equal(matchQuestion('Show me the echo gallery.', topics).score, 3);
});

test('duplicate keywords contribute to a score only once', () => {
  const topics = [{
    id: 'copper-widget',
    status: 'verified',
    type: 'answer',
    response: 'Synthetic copper-widget answer.',
    keywords: [
      { text: 'widget', weight: 2 },
      { text: 'widget', weight: 2 }
    ]
  }];

  assert.equal(matchQuestion('Tell me about the widget.', topics).score, 2);
});

test('identical phrase and keyword terms contribute only once', () => {
  const topics = [{
    id: 'paper-model',
    status: 'verified',
    type: 'answer',
    response: 'Synthetic paper-model answer.',
    phrases: ['paper model'],
    keywords: ['paper model']
  }];

  assert.equal(matchQuestion('Where is the paper model?', topics).score, 3);
});

test('duplicate normalized terms retain their highest weight', () => {
  const topics = [{
    id: 'glass-engine',
    status: 'verified',
    type: 'answer',
    response: 'Synthetic glass-engine answer.',
    phrases: [{ text: 'glass engine', weight: 2 }],
    keywords: [
      { text: 'glass-engine', weight: 7 },
      { text: 'glass engine', weight: 4 }
    ]
  }];

  assert.equal(matchQuestion('Explain the glass engine.', topics).score, 7);
});

test('matches whole terms instead of substrings inside other words', () => {
  const topics = [{
    id: 'art-display',
    status: 'verified',
    type: 'answer',
    response: 'Synthetic art-display answer.',
    keywords: [{ text: 'art', weight: 5 }]
  }];

  assert.equal(matchQuestion('Where is the cart display?', topics).type, 'fallback');
  assert.equal(matchQuestion('Where is the art display?', topics).topicId, 'art-display');
});

test('asks for clarification when topic scores are similarly strong', () => {
  const topics = [
    {
      id: 'blue-widget',
      status: 'verified',
      type: 'answer',
      response: 'Synthetic blue-widget answer.',
      phrases: [{ text: 'shared widget', weight: 4 }]
    },
    {
      id: 'red-widget',
      status: 'verified',
      type: 'answer',
      response: 'Synthetic red-widget answer.',
      phrases: [{ text: 'shared widget', weight: 4 }]
    }
  ];

  assert.deepEqual(matchQuestion('Tell me about the shared widget.', topics), {
    type: 'clarify',
    topicId: null,
    response: 'Could you clarify which topic you mean?',
    score: 4
  });
});

test('applies the ambiguity margin inclusively at its boundary', () => {
  const topics = [
    {
      id: 'amber-model',
      status: 'verified',
      type: 'answer',
      response: 'Synthetic amber-model answer.',
      keywords: [{ text: 'amber', weight: 5 }]
    },
    {
      id: 'violet-model',
      status: 'verified',
      type: 'answer',
      response: 'Synthetic violet-model answer.',
      keywords: [{ text: 'violet', weight: 4 }]
    }
  ];
  const question = 'Compare the amber and violet models.';

  assert.equal(matchQuestion(question, topics, { ambiguityMargin: 1 }).type, 'clarify');
  assert.equal(matchQuestion(question, topics, { ambiguityMargin: 0 }).topicId, 'amber-model');
});

test('selects the stronger topic outside the ambiguity margin', () => {
  const topics = [
    {
      id: 'amber-model',
      status: 'verified',
      type: 'answer',
      response: 'Synthetic amber-model answer.',
      keywords: [{ text: 'amber', weight: 5 }]
    },
    {
      id: 'violet-model',
      status: 'verified',
      type: 'answer',
      response: 'Synthetic violet-model answer.',
      keywords: [{ text: 'violet', weight: 3 }]
    }
  ];

  const result = matchQuestion('Compare amber and violet.', topics, { ambiguityMargin: 1 });
  assert.equal(result.type, 'answer');
  assert.equal(result.topicId, 'amber-model');
});

test('returns a safe fallback for unknown and empty questions', () => {
  const expected = {
    type: 'fallback',
    topicId: null,
    response: "I don't have a verified answer for that question.",
    score: 0
  };

  assert.deepEqual(matchQuestion('Will it rain tomorrow?', TOPICS), expected);
  assert.deepEqual(matchQuestion('   ', TOPICS), expected);
});

test('enforces the configured minimum confidence score', () => {
  const result = matchQuestion('open', TOPICS, { minimumScore: 2 });

  assert.equal(result.type, 'fallback');
  assert.equal(result.score, 0);

  const zeroThreshold = matchQuestion('unrelated words', TOPICS, { minimumScore: 0 });
  assert.equal(zeroThreshold.type, 'fallback');
});

test('accepts a score exactly equal to the minimum threshold', () => {
  const topics = [{
    id: 'threshold-topic',
    status: 'verified',
    type: 'answer',
    response: 'Synthetic threshold answer.',
    keywords: [{ text: 'threshold', weight: 2 }]
  }];

  assert.equal(
    matchQuestion('threshold', topics, { minimumScore: 2 }).topicId,
    'threshold-topic'
  );
  assert.equal(matchQuestion('threshold', topics, { minimumScore: 3 }).type, 'fallback');
});

test('ignores topics that are not explicitly verified', () => {
  const topics = [
    ...TOPICS,
    {
      id: 'secret-moon-room',
      status: 'draft',
      type: 'answer',
      response: 'This unverified fixture must never be returned.',
      phrases: [{ text: 'secret moon room', weight: 100 }]
    }
  ];

  assert.equal(matchQuestion('Where is the secret moon room?', topics).type, 'fallback');
});

test('ignores missing and malformed topic records', () => {
  const topics = [
    null,
    47,
    'not-a-topic',
    {},
    [],
    {
      id: 'unsupported-type',
      status: 'verified',
      type: 'other',
      response: 'This synthetic record must be ignored.',
      keywords: [{ text: 'malformed', weight: 20 }]
    }
  ];

  assert.equal(matchQuestion('malformed', topics).type, 'fallback');
  assert.equal(matchQuestion('anything', null).type, 'fallback');
});

test('ignores topics with missing or blank response text', () => {
  const topics = [
    {
      id: 'missing-response',
      status: 'verified',
      type: 'answer',
      keywords: [{ text: 'missing', weight: 20 }]
    },
    {
      id: 'blank-response',
      status: 'verified',
      type: 'answer',
      response: '   ',
      keywords: [{ text: 'blank', weight: 20 }]
    }
  ];

  assert.equal(matchQuestion('missing', topics).type, 'fallback');
  assert.equal(matchQuestion('blank', topics).type, 'fallback');
});

test('ignores route topics with missing or invalid destinations', () => {
  const incompleteRoutes = [
    {
      id: 'missing-zone',
      status: 'verified',
      type: 'route',
      response: 'Incomplete synthetic route.',
      destinationNpcId: 'npc-example',
      phrases: [{ text: 'missing zone route', weight: 20 }]
    },
    {
      id: 'blank-npc',
      status: 'verified',
      type: 'route',
      response: 'Invalid synthetic route.',
      destinationNpcId: '   ',
      destinationZoneId: 'zone-example',
      phrases: [{ text: 'blank npc route', weight: 20 }]
    },
    {
      id: 'missing-npc',
      status: 'verified',
      type: 'route',
      response: 'Incomplete synthetic route.',
      destinationZoneId: 'zone-example',
      phrases: [{ text: 'missing npc route', weight: 20 }]
    },
    {
      id: 'blank-zone',
      status: 'verified',
      type: 'route',
      response: 'Invalid synthetic route.',
      destinationNpcId: 'npc-example',
      destinationZoneId: '   ',
      phrases: [{ text: 'blank zone route', weight: 20 }]
    },
    {
      id: 'non-string-destinations',
      status: 'verified',
      type: 'route',
      response: 'Invalid synthetic route.',
      destinationNpcId: 47,
      destinationZoneId: ['zone-example'],
      phrases: [{ text: 'non string route', weight: 20 }]
    }
  ];

  assert.equal(matchQuestion('missing zone route', incompleteRoutes).type, 'fallback');
  assert.equal(matchQuestion('blank npc route', incompleteRoutes).type, 'fallback');
  assert.equal(matchQuestion('missing npc route', incompleteRoutes).type, 'fallback');
  assert.equal(matchQuestion('blank zone route', incompleteRoutes).type, 'fallback');
  assert.equal(matchQuestion('non string route', incompleteRoutes).type, 'fallback');
});

test('identical inputs return identical results', () => {
  const first = matchQuestion('Could I see the paper robots?', TOPICS);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.deepEqual(matchQuestion('Could I see the paper robots?', TOPICS), first);
  }
});
