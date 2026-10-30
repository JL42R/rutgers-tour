# Offline Guide document ingestion and approved retrieval

This Issue #47 milestone demonstrates how reviewed fictional documents can expand the local Guide
without model training. It does not ingest Rutgers CORE material, expose an upload endpoint, create
authentication, deploy a backend, call OpenAI, collect visitor questions, or change the production
tour. Every included document is classified `synthetic_fixture`.

## Stage 69C.2 status and reproduced evidence

Contracts/schema/gap aggregation (PR #70) and ingestion/simulated administration/legacy conversion
(PR #71) are already merged. This branch adds the deterministic retrieval engine, reviewed-profile
validator, original retrieval tests, synthetic quality fixture/baseline, and one independent offline
evaluation file. It has no Worker imports or production startup integration.

The source and fixed evaluation data come from preserved handoff
`3d222dd29862abb6226d874ea5f937fcd7a29952`. The retrieval algorithm, scoring weights, aliases,
questions, expected evidence, and historical baseline are unchanged. A minimal profile-validator
fix rejects non-string and over-128-character `profileVersion` values before regex coercion;
the regression reproduced the original acceptance of malformed version metadata.

Reproduced here: 8/8 original retrieval tests and 11/11 offline quality tests. The fixed dataset has
57 cases, but only its 52 direct questions run in this stage. Results: 29/29 supported Top-1,
41/41 expected-fact recall, zero false support across 16 unsupported cases, 7/7 ambiguity/conflict
outcomes, and 29/29 citation checks. The test also checks exact expected fact/source sets against
approved records, retirement under a new version, and the unchanged runtime three-zone route gate.
These are curated synthetic development measurements, not real-world accuracy or generalization.

The five contextual cases, Worker/model adapters, browser API/client, localhost server, live hallway
integration, and Worker-dependent holdout/challenge evaluations are not integrated here. Later
sections marked historical preserve the original handoff's results and file paths; those artifacts
remain in the [preserved handoff](https://github.com/JL42R/rutgers-tour/tree/3d222dd29862abb6226d874ea5f937fcd7a29952).
The historical 30/44 generalization result has not been remeasured in this branch.

Knowledge, profiles and review metadata are trusted synthetic developer inputs. Metadata validation
is not authentication or proof of human authorization/source truth. No visitor question, document
or model response can edit the profile through an interface supplied by this stage. There is no
browser profile endpoint, telemetry, provider connection, real CORE approval, or deployment.

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

### Reviewed fact answerability

Topic relevance and answerability are separate checks for reviewed profiles. Topic/fact aliases
still locate and rank a relevant topic, but they are not themselves proof that a fact answers the
requested property. Each approved fact has version-bound, reviewed `answerabilityPhrases`.
The generalization layer also declares a small reviewed property vocabulary and binds each approved
fact to the properties it can support. The question is split only at explicit `and` clauses; the
earliest reviewed property construction in each clause identifies what is being requested. A topic
match plus an unsupported property such as speed, price, mass, cleaning, capacity, or load rating
still has no eligible fact. When no reviewed property construction is recognized, the earlier
strict concept-coverage gate remains the fallback. Reinforcing facts may share evidence;
unresolved conflicts remain conflicts. Only eligible facts can be selected, so a nearby same-topic
passage is no longer added merely because its score is close. Failure returns `unsupported` with
`insufficient_answerability`, with no facts, citations, specialist, destination, or directions.

The answerability phrases do not add points to the ranking score. They do participate in reviewed
topic-evidence coverage and the later fact-level eligibility gate. Three narrow leading-clause
forms (`please explain`, `I only want to know`, and `explain whether`) focus that gate on the actual
request. Deterministic normalization handles only an explicit morphology table. There is no
unrestricted semantic verifier and no question-specific exception list. Unprofiled legacy
knowledge bypasses the new fact-level gate; the public API v1.0/v1.1 contracts remain unchanged.

## Historical handoff: Worker connection (not integrated)

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

## Historical handoff: Worker lifecycle demonstration

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
after results are (the profiled direct-query column is reproduced offline in this stage):

| Measure | Baseline | Profiled retrieval |
| --- | ---: | ---: |
| Top-1 supported-topic/fact accuracy | 16/29 (55.17%) | 29/29 (100%) |
| Recall@4 for expected facts | 20/41 (48.78%) | 41/41 (100%) |
| False support on unsupported cases | 11/16 (68.75%) | 0/16 (0%) |
| Ambiguity/conflict handling | 2/7 (28.57%) | 7/7 (100%) |
| Citation correctness | 15/29 (51.72%) | 29/29 (100%) |

These are exact results for this intentionally bounded synthetic dataset, not a claim of production
accuracy or generalization. In the original handoff, the Worker-path test exercised all 57 cases,
including routes and contextual follow-ups. This branch independently reproduces only direct
retrieval and authoritative evidence/source checks. Its retirement test rebuilds the index from the
new approved knowledge version and rejects the stale profile; it does not claim Worker/session
stale-context coverage. Callers must replace an old index when publishing a new approved version.

### Historical handoff: separate first-run holdout

`knowledge/guide-retrieval-quality-holdout.fixture.v1.json` contains 20 additional synthetic cases
(17 direct and three contextual) with no exact question overlap with the 57-case evaluation. Its
SHA-256 was frozen before the first run as
`BB9C93C0524886E9AF5BEB4F57B069180A707BFB7870D39701D89DB0A54F6764`. The first result was recorded
before reviewing holdout failures or tuning retrieval in
`knowledge/guide-retrieval-quality-holdout-results.v1.json`:

| Measure | First-run holdout result |
| --- | ---: |
| Top-1 supported-topic/fact accuracy | 7/8 (87.50%) |
| Recall@4 for expected facts | 8/9 (88.89%) |
| False support on unsupported cases | 4/5 (80.00%) |
| Ambiguity/conflict handling | 4/4 (100%) |
| Citation correctness | 6/8 (75.00%) |
| Complete expected Worker outcomes | 14/20 (70.00%) |

The six failing case IDs are `holdout-folded-amber-reset`, `holdout-orchard-token-food`,
`holdout-unsupported-automata-speed`, `holdout-unsupported-prism-chemicals`,
`holdout-unsupported-span-emergency-load`, and `holdout-unsupported-orchard-purchase`. The misses
show two different limits: conservative coverage can reject a relevant query, while broad lexical
evidence can still false-support a more specific unsupported claim. One answer also selected an
extra same-topic fact. These results are intentionally retained rather than tuned away after seeing
the holdout. They demonstrate that 100% on the original 57 cases is fixture-specific and does not
establish general retrieval accuracy.

The six first-run failures were diagnosed before implementing the answerability gate:

| Case | First-run behavior | Cause and Worker safety |
| --- | --- | --- |
| `holdout-folded-amber-reset` | Expected reset-tabs fact; returned unsupported (`insufficient_specific_evidence`). | Correct topic/fact existed, but `purpose`, `serve`, and `during` were wrongly treated as missing evidence. Conservative false negative; Worker safely abstained. |
| `holdout-orchard-token-food` | Returned the correct fruit-token fact (21.876916) plus unrelated moonlight fact (21.684773), both from the orchard atlas. | Near-score topic-wide selection hurt citation precision. The canonical answer was grounded but contained irrelevant evidence. |
| `holdout-unsupported-automata-speed` | Returned motion facts (18.738572 and 18.618947) from the folded handbook/demonstration log. | Exact `paper automata` aliases were mistaken for proof of an unsupported speed attribute. Worker false-supported the question with related but non-answering evidence. |
| `holdout-unsupported-prism-chemicals` | Returned glass-pattern/color facts (20.662634 and 20.566563) from the glass field guide. | Topic aliases bypassed evidence for polishing frequency and chemicals. Worker false-supported the question. |
| `holdout-unsupported-span-emergency-load` | Returned the cable-tension fact (22.807046) from the ribbon-bridge notes. | The topic was relevant, but no approved emergency/load-limit fact existed. Worker false-supported the question. |
| `holdout-unsupported-orchard-purchase` | Returned the non-edibility fact (26.556513) from the orchard atlas. | Acrylic/token overlap was treated as evidence for buying, although no purchase fact existed. Worker false-supported the question. |

No failure was caused by a bad fact/source binding, wrong knowledge version, carried context, or
invented provider prose. The common causes were topic aliases treated as proof, topic-wide evidence
coverage, and near-score extra passages. The four unsupported failures were therefore unsafe as
answers even though their text and citations were canonical.

The original result remains unchanged. After diagnosis, the same 20 cases became a development
set. The post-answerability measurement in
`knowledge/guide-retrieval-quality-holdout-after-answerability.v1.json` is 8/8 Top-1, 9/9
Recall@4, 0/5 false support, 4/4 ambiguity/conflict, 8/8 citation correctness, and 20/20 complete
Worker outcomes. It is explicitly not an unseen result.

`knowledge/guide-answerability-development.fixture.v1.json` freezes 20 diagnostic variations,
including the six originals, supported protections, unsupported same-topic properties, numerical,
time, cause, overlap, ambiguity, and context cases. Retrieval and the actual Worker path pass all
20/20 with canonical evidence and the injected fake provider only.

### Historical handoff: independent answerability holdout

`knowledge/guide-answerability-holdout.fixture.v1.json` contains 30 independently frozen synthetic
cases: 10 supported, 12 unsupported lookalikes, four ambiguous/conflicting, and four contextual.
There is no exact question overlap with the earlier 57- or 20-case files. Its pre-run SHA-256 is
`F2CC23C851D43C1D4FF950B458288D2855B53EE3AEF12E25E1C7C875C6ECB7FE`.

| Measure | First run | Final rerun |
| --- | ---: | ---: |
| Top-1 supported-topic/fact accuracy | 0/10 (0%) | 0/10 (0%) |
| Recall@4 for expected facts | 0/11 (0%) | 0/11 (0%) |
| False support on unsupported cases | 0/12 (0%) | 0/12 (0%) |
| Ambiguity/conflict handling | 0/4 (0%) | 0/4 (0%) |
| Citation correctness | 0/10 (0%) | 0/10 (0%) |
| Complete expected Worker outcomes | 14/30 (46.67%) | 14/30 (46.67%) |

The first run proves the new gate prevents these unsupported lookalikes, but it is far too literal:
it rejects all ten novel supported paraphrases and all four novel ambiguity/conflict phrasings.
The final rerun is identical. It occurred after regression fixes derived only from the already
examined 20-case diagnostic set, so it is recorded as post-first-run and not called unseen. Both
runs and every failure ID are preserved in
`knowledge/guide-answerability-holdout-results.v1.json`; expectations were not rewritten. This
result blocks any production-readiness or generalization claim and motivates a teammate-authored
blind set plus a reviewed design for recovering paraphrase recall without reintroducing false
support.

`test/guide-retrieval-holdout.test.js` preserves the original first-run metrics and verifies the
post-diagnosis result. `test/guide-answerability-holdout.test.js` verifies the new frozen hash and
both recorded runs through direct retrieval and the actual Worker boundary.

After the 30-case failures were examined, they became diagnostic development data. The actual root
causes were: ordinary inflections and generic relational verbs treated as required evidence;
alternative property wording required literally; `where` incorrectly treated as route intent;
cross-topic comparisons filtered before ambiguity; and duration conflicts filtered before claim
resolution. Reviewed property metadata, clause-level request focus, conservative topic anchoring,
exact reviewed-concept priority, and bounded route follow-up phrases raise this examined set to
10/10 Top-1, 11/11 Recall@4, 0/12 false support, 4/4 ambiguity/conflict, 10/10 citations, and 30/30
Worker outcomes. The result is stored in
`knowledge/guide-answerability-holdout-after-generalization.v1.json` and is not unseen evidence.

### Historical handoff: prospectively frozen generalization challenge

`knowledge/guide-generalization-challenge.fixture.v1.json` was written and hashed before its first
execution. It contains 44 Codex-authored synthetic cases: 12 supported paraphrases, 12 unsupported
lookalikes, six ambiguity/conflict cases, eight multi-fact/relationship cases, and six context
cases. Its SHA-256 is
`265966A4EA20466AA16C1A6302F87FB175C263C35A2DC8801D0CF9DB25159687`, with no exact question
overlap against the earlier fixtures.

| Measure | First frozen challenge run |
| --- | ---: |
| Top-1 supported-topic/fact accuracy | 11/20 (55.00%) |
| Recall@4 for expected facts | 17/30 (56.67%) |
| False support on unsupported cases | 0/13 (0%) |
| Ambiguity/conflict handling | 5/6 (83.33%) |
| Citation correctness | 9/20 (45.00%) |
| Complete expected Worker outcomes | 30/44 (68.18%) |

The first run is preserved in `knowledge/guide-generalization-challenge-results.v1.json`. It shows
material supported recall beyond the earlier 0/11 result while retaining zero false support, but
novel descriptive wording and several multi-property questions still over-abstain. No expectation
or retrieval rule was changed after this run. Because Codex authored the fixture, it is not a
human-authored blind benchmark; a teammate-authored evaluation remains required before any
real-world reliability claim.

## Historical handoff: development browser integration (not integrated)

The fixed retrieval-quality fixture is available to the existing Dialogue UI only in Vite
development mode through the allowlisted `retrieval-quality` localhost profile. The browser sends
the same v1.1 request contract used by the default local preview. The loopback server prepares the
reviewed approved view, runs retrieval and the fake Responses transport through the actual Worker
handler, and returns only Worker-validated canonical evidence, citations, friendly specialist and
destination names, and routes.

The browser-side catalog contains only fixed IDs, relationships, versions, routes, and display
names needed to validate responses and hold ID-only context. It contains no aliases, approval
records, source text, or facts. An arbitrary profile, file path, URL, or knowledge payload is
rejected. The constrained test-only retirement endpoint described in `GUIDE_LOCAL_E2E.md` exists
only to verify stale-context recovery under an exact new knowledge version.

## Historical handoff: earlier Worker lifecycle evaluation

`knowledge/guide-evaluation.fixture.v1.json` contains 15 fixed cases covering approved folded
machines, approved glass gardens, cloud kites before/during/after approval, retirement, overlapping
keywords, unsupported questions, ambiguity, specialist and destination routing, follow-up context,
source references, and adversarial instructions. The test compares exact outcomes and identifiers
through the Worker path and checks each response's knowledge version.

## Current offline verification

The earlier Worker lifecycle tests above remain in the handoff. Run this stage's tests directly;
`package.json` has no test script and no Worker is required:

```powershell
Set-Location C:\dev\rutgers-tour-pr69-retrieval
node --test test/guide-knowledge-retrieval.test.js
node --test test/guide-retrieval-offline-quality.test.js
node --test test/guide-knowledge-retrieval.test.js test/guide-retrieval-offline-quality.test.js
$trackedTests = @(git ls-files -- 'test/*.test.js' 'tests/*.test.js')
node --test @trackedTests
npm.cmd run build
git diff --check origin/main...HEAD
```

Windows checkout may convert LF to CRLF. The committed fixture/baseline blobs and original frozen
challenge expectations are preserved; this stage parses JSON and does not rewrite frozen hashes
or import the Worker-dependent holdout tests.

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
