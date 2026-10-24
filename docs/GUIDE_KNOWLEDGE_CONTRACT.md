# CORE Guide contract and knowledge schema

This document describes the offline foundation for Issue #47. It does not change the production
tour, connect an AI provider, deploy a backend, or add real Rutgers CORE facts. The included fixture
is deliberately fictional.

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
response-only fields. The server constructs them from approved records; model output and browser
state never become authoritative. Schema v1.1 adds required `specialistName` and
`destinationZoneName` fields while the endpoint continues to accept v1.0 requests and returns the
unchanged v1.0 response shape to those clients. This avoids breaking v1.0's exact-field validator.

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
for facts, specialists, and zones. Do not rewrite those modules merely to adopt this schema. After
the foundation PRs land, add one small compatibility adapter that consumes an already validated
approved view and:

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

## Future knowledge-gap workflow

A future, separately privacy-approved system may count minimized outcome categories such as
unsupported topic, missing source coverage, or ambiguous classification. It should aggregate these
signals without storing raw questions, answers, IP addresses, transcripts, or visitor profiles.
Authenticated team members may review recurring gaps and begin the publication workflow above.
Visitor statements and AI-generated text never become approved facts automatically.

No feedback collection, database, persistence, or visitor logging is implemented by this work.

## Grounding limitation

Passing these validators proves structure, lifecycle, and references—not the truth of generated
natural-language prose. A real release still requires server-side approved-fact retrieval,
constrained structured generation, model-output validation, fixed evaluations, refusal testing, and
human review of the source knowledge.

## Next integration boundary

The practical process for replacing fictional records with verified facility information is in
`docs/GUIDE_KNOWLEDGE_INTAKE.md`.

The next isolated stage should implement a Worker-compatible request handler with a mocked model:

```text
CORE Guide dialogue -> validated request -> Worker handler -> approved knowledge retrieval
                    -> mocked model -> server validation -> validated response -> dialogue
```

That handler should add method/content-type/body limits, cancellation, timeouts, canonical route
resolution, rate-limit and budget interfaces, and privacy-safe operational outcomes. Real provider
credentials, API calls, public deployment, billing, and data collection remain separately approved
work.
