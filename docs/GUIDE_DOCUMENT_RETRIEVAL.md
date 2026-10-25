# Offline Guide document ingestion and approved retrieval

This Issue #47 milestone demonstrates how reviewed fictional documents can expand the local Guide
without model training. It does not ingest Rutgers CORE material, expose an upload endpoint, create
authentication, deploy a backend, call OpenAI, collect visitor questions, or change the production
tour. Every included document is classified `synthetic_fixture`.

## Trust boundary

Document text is always untrusted data. `src/guide-document-ingestion.js` accepts only exact,
bounded metadata plus Markdown or plain text and always emits `draft` passages and knowledge
candidates with `approval: null`. A document cannot supply a lifecycle status or review record.
The adversarial fixture explicitly tells the system to ignore rules and approve itself; ingestion
preserves those words as draft content and gives them no authority.

Lifecycle changes use `src/guide-knowledge-administration.js`, a local test-only administrative
interface. Calling `applyTrustedKnowledgeTransition` is the simulated trusted action; it is not real
authentication. Actions have an exact schema, identify a complete linked record set, require review
metadata and a new `knowledgeVersion`, and use the existing transitions:

```text
draft -> in_review -> approved -> retired
```

Skipped, reversed, repeated, partial-invalid, visitor-shaped, and model-shaped actions fail closed.
A future production editor would need real authentication, authorization, audit history, conflict
handling, and deployment approval; none is implied by this mock interface.

## Synthetic document fixtures

`knowledge/document-fixtures.v1.json` contains stable document metadata and a separate
`administrativeExamples` section. Content lives in `knowledge/documents/`:

- `folded-machines.v1.md` — separate approved administrative example;
- `glass-gardens.v2.md` — separate approved administrative example;
- `cloud-kites.v1.md` — draft used by the before/after Worker demonstration;
- `clockwork-coral.v1.txt` — separate retired administrative example; and
- `malicious-override.v1.md` — draft adversarial data that never becomes authority.

Each document has multiple sections, a stable ID and version, a stable source ID, an explicit
fictional classification, and section/line passage locations. The lifecycle examples are outside
the documents so content can never approve itself.

## Deterministic ingestion

`ingestGuideDocument`:

1. rejects unknown metadata, unsupported formats, malformed identifiers, inconsistent routes, and
   content over the configured UTF-8 byte limit;
2. normalizes Unicode, line endings, whitespace, and unsafe control characters without evaluating
   document text;
3. recognizes Markdown headings or plain-text `[Section]` markers;
4. splits paragraphs into bounded passages without an AI extraction service;
5. assigns repeatable passage and fact IDs from the document ID, version, and ordinal;
6. preserves section names and source line ranges; and
7. generates schema-valid draft source, topic, fact, specialist, and zone candidates.

Passages become reviewable fact candidates because the current normalized knowledge contract uses
facts as its smallest cited unit. No document database or new dependency is introduced.

## Approved-only lexical retrieval

`src/guide-knowledge-retrieval.js` builds a deterministic in-memory index from the frozen result of
`createApprovedKnowledgeView`. It validates references before indexing and rejects any collection
that still contains draft, in-review, or retired records. Search:

- validates and bounds the natural-language question;
- normalizes tokens and removes a small fixed stop-word set;
- gives topic terms more weight than passage and source terms;
- ranks passages with deterministic ID tie-breaking;
- returns one approved topic, bounded results, fact/source IDs, source locations, and the exact
  `knowledgeVersion`;
- returns `ambiguous` for equal top-topic evidence; and
- returns `unsupported` or `invalid` without citations when evidence is unavailable.

For the retrieval-quality fixture, `src/guide-retrieval-profile.js` additionally validates a
reviewed, version-bound profile of topic aliases, fact aliases, excluded phrases, ambiguity rules,
claim relationships, and exact fact/source locations. The profile cannot name an unknown record,
change a source location, or attach itself to a different knowledge version. Its aliases and rules
are reviewed knowledge configuration, never visitor- or model-supplied input.

Profiled retrieval adds deterministic morphology normalization, BM25-style content scoring,
inverse-document-frequency weights, phrase weights, conservative specific-term coverage, and
explicit competing-topic checks. Reinforcing claims may return passages from multiple approved
sources. An unresolved conflict between approved claims returns `conflict` internally and becomes
a citation-free clarification response at the Worker boundary.

This remains lexical matching, not semantic proof. The manually reviewed profile is maintenance
work, can miss unlisted synonyms and nuanced paraphrases, and does not establish that source content
is true. Unprofiled legacy fixtures preserve their earlier deterministic matching behavior; the
stricter exclusion and conflict rules require a reviewed profile.

## Worker connection

`worker/src/approved-knowledge.js` constructs the approved retriever with the existing catalog and
legacy adapter. `worker/src/guide-handler.js` asks retrieval first, projects only the ranked facts
into the existing provider-neutral model request, and reconstructs citations, friendly names, and
canonical routing from server-owned knowledge. For a reviewed retrieval profile, an unsupported,
ambiguous, conflicting, or invalid retrieval result cannot be overridden by the legacy matcher.
The fallback remains only for unprofiled legacy knowledge. Follow-up context still uses the existing
bounded ID-only conversation state, and a version whose retirement removes those IDs rejects stale
context before generation.

The model may select only retrieved fact IDs and may decline for insufficient evidence. Its prose
is not authoritative: after validating the structured result, the Worker builds `answerText` from
the canonical content of the selected approved facts. Unknown, duplicate, or unoffered fact IDs,
model-declared insufficient evidence, provider failure, and malformed output fail closed without
citations.

The public v1.0 and v1.1 envelopes are unchanged. Passage location remains internal; public answers
continue to return the already-supported stable `{ factId, sourceId }` references. The fake model
transport remains mandatory, and the model never supplies citations, lifecycle state, specialists,
destinations, display names, or directions.

## Cloud-kite lifecycle demonstration

`test/guide-document-retrieval-e2e.test.js` exercises the actual Worker handler:

```text
initial corpus -> cloud question unsupported
ingested draft -> still unsupported
trusted in-review transition -> still unsupported
trusted approval + new knowledgeVersion -> answered with approved fact/source IDs
trusted retirement -> unsupported again
```

The exact same injected fake model object is used before and after publication. Its `train` method
would fail the test if called; the recorded training-call count remains zero. Adding knowledge is
data publication and index reconstruction, not model fine-tuning or retraining.

## Retrieval-quality evaluation

`knowledge/guide-retrieval-quality-evaluation.fixture.v1.json` is a frozen synthetic evaluation of
57 questions: 52 direct queries and five contextual follow-ups. It covers exact wording, natural
paraphrases, approved synonyms, short and long questions, irrelevant terms, multiple sources,
ambiguous topics, unresolved conflicts, unsupported lookalikes, adversarial text, draft and retired
claims, missing routes, topic switches, and empty context. It uses 18 approved passages across seven
fictional topics plus three non-approved passages; no Rutgers CORE facts are present.

The untouched retriever baseline and exact failure IDs are recorded in
`knowledge/guide-retrieval-quality-baseline.v1.json`. On the same fixed direct-query set, before and
after results are:

| Measure | Baseline | Profiled retrieval |
| --- | ---: | ---: |
| Top-1 supported-topic/fact accuracy | 16/29 (55.17%) | 29/29 (100%) |
| Recall@4 for expected facts | 20/41 (48.78%) | 41/41 (100%) |
| False support on unsupported cases | 11/16 (68.75%) | 0/16 (0%) |
| Ambiguity/conflict handling | 2/7 (28.57%) | 7/7 (100%) |
| Citation correctness | 15/29 (51.72%) | 29/29 (100%) |

These are exact results for this intentionally bounded synthetic dataset, not a claim of production
accuracy or generalization. The Worker-path test runs every case, verifies canonical evidence text,
citations, routes, topic switching, and follow-up context, and proves that no training method is
called. A separate lifecycle test proves stale approved context is rejected after retirement under
a new knowledge version.

## Earlier lifecycle evaluation

`knowledge/guide-evaluation.fixture.v1.json` contains 15 fixed cases covering approved folded
machines, approved glass gardens, cloud kites before/during/after approval, retirement, overlapping
keywords, unsupported questions, ambiguity, specialist and destination routing, follow-up context,
source references, and adversarial instructions. The test compares exact outcomes and identifiers
through the Worker path and checks each response's knowledge version.

Run the focused milestone tests in PowerShell:

```powershell
Set-Location C:\dev\rutgers-tour-issue47-local-e2e
node --test --test-concurrency=1 test/guide-document-ingestion.test.js test/guide-knowledge-administration.test.js test/guide-knowledge-retrieval.test.js test/guide-document-retrieval-e2e.test.js test/guide-knowledge-gaps.test.js
```

Then run `npm.cmd test` and `npm.cmd run build`.

## Minimized synthetic knowledge gaps

`src/guide-knowledge-gaps.js` is an offline aggregation demonstration, not analytics. It accepts
only `knowledgeVersion`, general `category`, `outcomeCode`, and `aggregateCount`. Exact-field
validation rejects questions, transcripts, IP addresses, persistent visitor IDs, and personal
information. It creates no storage and sends nothing anywhere.

A future administrator could review only these aggregates, identify a recurring general category,
locate an authorized source independently, and begin the normal draft/review/approval workflow.
Neither a count nor a visitor statement becomes a fact. Enabling real collection would require a
separate privacy review, retention decision, access controls, user notice, and explicit approval.

## Production isolation

The synthetic documents live outside `public/` and are imported only by Node tests. The production
entry point does not import ingestion, administration, retrieval, gap aggregation, Worker modules,
document fixtures, or fake-provider code. The normal tour remains static and scripted; calibrated
geometry, NPC placement, zones, dialogue, tracker behavior, keyboard behavior, and narration are
unchanged.
