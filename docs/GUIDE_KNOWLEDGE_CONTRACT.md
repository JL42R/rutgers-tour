# CORE Guide contract and knowledge schema

This document describes the offline foundation for Issue #47. It does not change the production
tour, connect an AI provider, deploy a backend, or add real Rutgers CORE facts. The included fixture
is deliberately fictional.

## Stage 69B integration status

Stage 69B imports only the independent API contract, knowledge schema, synthetic knowledge-gap
aggregator, their tests, and `knowledge/core-guide.fixture.v1.json` from the preserved PR #69
handoff commit `3d222dd29862abb6226d874ea5f937fcd7a29952`. These modules have no runtime imports,
network calls, persistence, or production startup wiring. The fixture and its review metadata are
synthetic test data, not factual or subject-matter approval for Rutgers CORE.

The matcher (#48), conversation memory (#59), and reviewed orchestrator (#61) are already on main
and remain unchanged. Compatibility conversion, ingestion, lifecycle administration, retrieval,
Worker/model adapters, localhost clients/servers, and hallway question-provider UI remain in the
original handoff for later integration stages. Nothing here deploys or activates those layers.

Independent contract/schema fixtures deliberately use fictional IDs and destinations. They do not
add tour environments or relax the runtime scope of hallway, printing-room, and project-studio.

## API boundary

`src/guide-api-contract.js` defines the current version `1.1` and legacy-compatible version `1.0`
request and response envelopes. The browser sends
only a request ID, a visitor question, and bounded temporary topic/specialist/zone IDs. It cannot
submit facts, approval state, canonical routes, transcripts, visitor identifiers, or provider
payloads.

The future Worker validates the request against an authoritative catalog built from approved
knowledge. It returns one of four outcomes:

- `answered` — grounded answer with topic and fact/source references;
- `clarify` — the visitor must disambiguate, with no factual or routing assertion;
- `unsupported` — no approved answer is available;
- `unavailable` — a structured provider, rate-limit, or internal failure plus safe fallback text.

Canonical specialist IDs, destination zone IDs, directions, and optional friendly display names are
response-only fields. A future server must construct them from approved records; model output and
browser state never become authoritative. Schema v1.1 adds required `specialistName` and
`destinationZoneName` fields; the validators also accept the unchanged v1.0 response shape.
No endpoint is included in Stage 69B. Approved-ID and canonical-reference checks depend on an
authoritative catalog from `createKnowledgeCatalog`; callers must supply it. Catalog checks do
not authenticate a caller or establish source truth.

## Knowledge records

`src/guide-knowledge-schema.js` validates a normalized knowledge document containing sources,
topics, facts, specialists, and destination zones. Records use one lifecycle vocabulary: `draft`,
`in_review`, `approved`, or `retired`. Approved records require review metadata, and approved facts
may reference only approved topics and sources. Approved specialist routes may reference only
approved topics and destination zones with canonical directions.

`createApprovedKnowledgeView` removes every non-approved record. `createKnowledgeCatalog` derives
the identifier and friendly-name maps used by the API validators. The focused
`isKnowledgeLifecycleTransitionAllowed` helper checks the reviewed draft → in-review → approved →
retired publication path separately from snapshot validation. These functions should run in the
future Worker; the browser is not a security boundary.

The first production knowledge file should be bundled with the Worker from a repository-controlled
location rather than trusted from visitor input or a public URL.

## Compatibility with Stages 2–4

The current local modules use `verified` for topics, nested topic facts using `text`, and `approved`
for facts, specialists, and zones. Do not rewrite those modules merely to adopt this schema.
A later integration stage will port the handoff's compatibility adapter to consume an already
validated approved view and:

1. maps approved topic status to the legacy `verified` value;
2. joins normalized facts through each topic's `factIds` and maps `content` to legacy `text`;
3. maps specialist `destinationZoneId` to the legacy zone relationship;
4. copies directions only from the approved destination-zone record; and
5. rejects missing or duplicate joins rather than guessing.

That adapter lets the deterministic matcher, conversation state, and orchestrator remain unchanged
while the backend becomes authoritative. In production, the browser remains responsible for the
dialogue UI, accessibility, bounded temporary context, request cancellation, stale-response
suppression, safe text display, and deterministic fallback.

## Publication workflow

1. A team member adds a source and related records with `draft` status.
2. A domain owner checks accuracy, provenance, routing, and directions.
3. The records move to `in_review` while review and fixed-question tests run.
4. Approval metadata records the reviewer, date, and issue or PR reference.
5. Only records deliberately changed to `approved` enter the authoritative view.
6. Automated schema, reference, conversation, and knowledge-evaluation tests must pass.
7. The reviewed change is merged and the Worker publishes a new `knowledgeVersion`.
8. A bad release is rolled back by reverting the knowledge commit or redeploying the prior version.

Adding records changes data, not the matching or conversation engine. If the approved corpus later
outgrows deterministic lookup, the same record IDs, lifecycle, approval, version, and source fields
can feed a retrieval index. Indexing approved documents is retrieval, not model fine-tuning.

## Minimized knowledge-gap boundary

The offline synthetic demonstration may aggregate minimized outcome categories such as
unsupported topic, missing source coverage, or ambiguous classification. It should aggregate these
signals without storing raw questions, answers, IP addresses, transcripts, or visitor profiles.
Authenticated team members may review recurring gaps and begin the publication workflow above.
Visitor statements and AI-generated text never become approved facts automatically.

`src/guide-knowledge-gaps.js` validates only knowledge version, general category, outcome code, and
aggregate count. It rejects extra question, transcript, and visitor-identifying fields, and bounds
token values and counts. Token validation cannot identify personal data encoded inside an allowed
value; inputs must already be curated, minimized synthetic aggregates. It is not an anonymizer.
No live feedback collection, database, persistence, or visitor logging is implemented by this work.

## Grounding limitation

Passing these validators proves structure, lifecycle, and references—not the truth of generated
natural-language prose. A real release still requires server-side approved-fact retrieval,
constrained structured generation, model-output validation, fixed evaluations, refusal testing, and
human review of the source knowledge.

## Document retrieval integration

The practical intake and document-retrieval procedures remain in the preserved handoff's
[GUIDE_KNOWLEDGE_INTAKE.md](https://github.com/JL42R/rutgers-tour/blob/3d222dd29862abb6226d874ea5f937fcd7a29952/docs/GUIDE_KNOWLEDGE_INTAKE.md)
and [GUIDE_DOCUMENT_RETRIEVAL.md](https://github.com/JL42R/rutgers-tour/blob/3d222dd29862abb6226d874ea5f937fcd7a29952/docs/GUIDE_DOCUMENT_RETRIEVAL.md).
Those documents and the following implemented handoff path are not imported in Stage 69B:

```text
fixed evaluation -> validated request -> Worker handler -> approved passage retrieval
                    -> mocked model -> server validation -> validated response -> dialogue
```

Ingestion creates only draft candidates. A separate simulated trusted administrative operation is
required for review, approval, knowledge-version changes, and retirement. Real provider credentials,
API calls, public deployment, authentication, billing, and data collection remain separately
approved work.
