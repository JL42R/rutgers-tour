# Offline CORE Guide Worker handoff

This stage proves the future backend boundary without deploying a Worker or calling an AI provider.
All knowledge is fictional, all model behavior is local, and no visitor questions are persisted.

## Request path

The browser adapter sends a version `1.1` JSON request to one configured HTTPS endpoint; the
handler also accepts legacy `1.0` callers and preserves their original response shape. The
Worker applies origin, method, content-type, byte-size, schema, question-length, and context-ID
checks before matching the question. CORS limits which browser origins can read responses; it is not
authentication and does not prevent direct calls to a public endpoint.

For valid requests, the handler loads a server-owned knowledge version, removes every non-approved
record, builds the deterministic approved-only lexical index, and retrieves ranked passages before
converting the approved view for the existing Stage 2–4 modules. The original deterministic matcher
remains a fallback. The browser never supplies facts, approval state,
specialist mappings, destination mappings, or directions.

## Approved knowledge loading

`worker/src/approved-knowledge.js` validates the complete knowledge document before constructing an
approved-only view and identifier catalog. Invalid references, duplicate IDs, unapproved routes, or
missing approval data prevent the knowledge version from loading. A deployment should bundle the
reviewed JSON with the Worker so a public browser asset cannot become the authority.

Publishing new information remains a source-control operation: draft, review, approval metadata,
fixed-question tests, merge approval, and deployment under a new `knowledgeVersion`. Rollback means
redeploying the last reviewed version or reverting the knowledge change.

The offline document milestone is described in `GUIDE_DOCUMENT_RETRIEVAL.md`. Passage section and
line locations are retained internally by retrieval. Public API versions 1.0 and 1.1 remain
unchanged and continue to expose stable fact/source references only.

## Model interface

The handler depends only on:

```js
model.generateResponse(modelRequest, { signal })
```

`modelRequest` contains the question, canonical topic ID, retrieved approved facts, allowed fact
IDs, and bounded temporary context. `worker/src/mock-guide-model.js` implements this interface using
fact text only and performs no network calls. The handler propagates an `AbortSignal`, enforces its
own timeout, and validates the returned Stage 4 structure and fact IDs.

A future OpenAI adapter should implement the same interface. It should call the Responses API from
the Worker, request a strict structured result matching the existing four Stage 4 fields, disable
unneeded tools, bound output length, pass the signal to the provider request, and use the provider's
applicable data controls such as `store: false`. No provider SDK types should leak into the shared
browser/Worker contract. Official references: [Responses API quickstart](https://developers.openai.com/api/docs/quickstart),
[production best practices](https://developers.openai.com/api/docs/guides/production-best-practices),
and [API data controls](https://developers.openai.com/api/docs/guides/your-data).

Declaring valid fact IDs does not prove that arbitrary model prose is true. A live adapter still
requires constrained prompts, strict structured output, fixed grounding evaluations, refusal tests,
and ongoing review. The current mock avoids that uncertainty by returning approved fixture text.

## Credentials and deployment

A future provider key belongs in an encrypted Cloudflare Worker secret owned by the approved team
account. It must never appear in Vite environment variables, GitHub Pages, browser JavaScript,
knowledge JSON, logs, tests, or source control. Creating an account, key, billing relationship,
Worker project, route, or deployment is outside this stage and requires separate authorization.

## Browser integration and temporary context

The existing CORE Guide remains the only hallway guide. Its question provider will eventually send
the visitor's typed question plus bounded arrays of approved topic, specialist, and destination IDs.
The Worker converts the most recent compatible IDs into the existing temporary conversation state.
It rejects unknown or inconsistent relationships instead of trusting browser memory.

The dialogue adapter should create an `AbortController` for each question, abort it when the dialogue
closes or a newer question replaces the request, and retain the existing request-version check so a
late response cannot update closed UI. Closing or reloading clears ordinary conversation context.
No persistent identity or transcript is needed.

## Rate, budget, privacy, and failure behavior

The offline handler accepts injected rate-limit and budget decisions and calls them before the model.
Those interfaces receive only request ID and origin—not the question or answer. Test doubles prove
the denial paths, but they are not global production enforcement.

A deployment needs durable shared limits, per-project provider limits, usage alerts, a hard budget
circuit breaker, and an abuse strategy appropriate for a public unauthenticated endpoint. An
in-memory Worker counter is not sufficient because isolates and locations do not share reliable
state. The version `1.0` response contract has no dedicated `budget_exhausted` error code, so this
prototype reports budget denial as `provider_unavailable`; adding a distinct code would require a
reviewed contract version change.

Operational logging is limited to event name, request ID, outcome/status, and provider failure code.
Raw questions, generated answers, transcripts, IP addresses, visitor profiles, and persistent
identifiers are not logged or stored by this implementation.

Provider errors, invalid model output, unknown fact references, timeout, rate denial, and budget
denial return validated `unavailable` envelopes. Unsupported and ambiguous questions bypass the
model and return `unsupported` or `clarify`. Canonical specialist, zone, and direction values are
always rebuilt from server-owned approved records. Version `1.1` also returns friendly specialist
and destination names from those same authoritative records; the model cannot submit them.

## Decisions required before a live connection

- Approval to change the locked static/no-backend architecture and project schedule.
- Cloudflare account, project, domain, deployment, secret-rotation, and incident owners.
- OpenAI organization/project owner, model evaluation, budget, and hard-stop thresholds.
- Production CORE sources, domain reviewers, approval rules, and rollback owner.
- Allowed production origins and public abuse/rate-limit policy.
- Privacy notice, minimized logging fields, access controls, and retention duration.
- Browser integration, accessibility, Edge, NVDA, provider-failure, and cost test sign-off.

Until those decisions are recorded, this Worker remains a local testable module only.
