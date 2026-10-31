# Offline CORE Guide Worker handoff

This stage proves the future backend boundary without deploying a Worker or calling an AI provider.
All knowledge is fictional, all model behavior is local, and no visitor questions are persisted.
This is Stage 69D.1: an offline JavaScript module, not a deployed Cloudflare Worker.

## Integration status

- Already in main: API contracts and knowledge schema (#70), ingestion, simulated lifecycle and
  legacy compatibility (#71), approved-only retrieval and reviewed profiles (#72), matcher,
  conversation memory, and the reviewed orchestrator.
- This local stage: three Worker modules, three Worker/evaluation test files, the fixed 15-case
  synthetic evaluation fixture, and this document. No production entrypoint imports these modules.
- Not integrated into main: OpenAI-compatible adapter, local HTTP development server, browser API
  client, hallway NPC development integration, live backend deployment, real authentication and
  approval workflow, or real Rutgers CORE knowledge publication. Those remain separately reviewed
  future work; the preserved draft #69 is a reference, not an integration dependency.

## Request path

Offline tests construct version `1.1` JSON Requests and invoke the handler directly; the
handler also accepts legacy `1.0` callers and preserves their original response shape. The
Worker applies origin, method, content-type, byte-size, schema, question-length, and context-ID
checks before matching the question. CORS limits which browser origins can read responses; it is not
authentication and does not prevent direct calls to a public endpoint.

For valid requests, the handler loads a server-owned knowledge version, removes every non-approved
record, builds the deterministic approved-only lexical index, and retrieves ranked passages before
converting the approved view for the existing Stage 2–4 modules. The original deterministic matcher
remains a fallback when no reviewed profile explicitly abstains. Current-main conversation memory
and orchestrator retain their three-zone production gate. The offline Worker has a narrow
catalog-based route resolver for fictional backend fixtures: it first uses current memory, then
permits its compatibility fallback only when the validated approved knowledge view has
`contentClassification: 'synthetic_fixture'`. It accepts only exact canonical topic/specialist/zone
relationships from that view. Explicit supported follow-ups can reuse those validated relationships.
For `production` knowledge, the fallback is disabled and existing conversation validation remains
in charge of selection and context clearing. Before model invocation, canonical route validation
also permits production destinations only in `hallway`, `printing-room`, and `project-studio`.
Blocked initial routes return citation-free `unsupported`; invalid remembered production routes
cannot be restored by follow-ups. Legitimate production routes and informational answers still work.
Classification comes exclusively from the trusted loader's approved view, never request bodies,
headers, query parameters, or a caller-selected zone list. Missing/malformed classification fails
authoritative knowledge validation. No browser route
policy, production zone, NPC placement, or navigation behavior is changed. The browser never supplies facts, approval state,
specialist mappings, destination mappings, or directions.

## Approved knowledge loading

`worker/src/approved-knowledge.js` validates the complete knowledge document before constructing an
approved-only view and identifier catalog. Invalid references, duplicate IDs, unapproved routes, or
missing approval data prevent the knowledge version from loading. A deployment should bundle the
reviewed JSON with the Worker so a public browser asset cannot become the authority.

The existing administrative lifecycle is a trusted in-memory simulation, not an authenticated
approval API. The loader validates approval metadata; it does not establish reviewer identity or
source truth and never promotes records itself. A future publication process needs real reviewers,
fixed-question tests, merge approval and versioned deployment/rollback. Tests rebuild the loader
when publishing a new knowledge version; an old loader remains an old immutable snapshot.

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
own timeout, and validates the returned Stage 4 structure and fact IDs. The model's `answerText` is
discarded after validation; visitor-facing answer text is reconstructed from the canonical content
of the approved fact IDs selected from that request. The model therefore cannot turn invented prose
into an authoritative answer even when it returns an otherwise valid structure.

A future OpenAI adapter should implement the same interface. It should call the Responses API from
the Worker, request a strict structured result matching the existing four Stage 4 fields, disable
unneeded tools, bound output length, pass the signal to the provider request, and use the provider's
applicable data controls such as `store: false`. No provider SDK types should leak into the shared
browser/Worker contract. Official references: [Responses API quickstart](https://developers.openai.com/api/docs/quickstart),
[production best practices](https://developers.openai.com/api/docs/guides/production-best-practices),
and [API data controls](https://developers.openai.com/api/docs/guides/your-data).

Valid fact IDs and canonical reconstruction bind the response to reviewed evidence, but they do not
prove that the reviewed source itself is true or that retrieval selected the best evidence. A live
adapter still requires constrained prompts, strict structured output, fixed grounding evaluations,
refusal tests, source review, and ongoing monitoring.

## Credentials and deployment

A future provider key belongs in an encrypted Cloudflare Worker secret owned by the approved team
account. It must never appear in Vite environment variables, GitHub Pages, browser JavaScript,
knowledge JSON, logs, tests, or source control. Creating an account, key, billing relationship,
Worker project, route, or deployment is outside this stage and requires separate authorization.

## Browser integration and temporary context

Browser integration is future work. The public tour remains static and scripted-only; no
localhost endpoint, browser API client, development guide UI, or provider transport is added here.
Offline tests send bounded arrays of approved topic, specialist and destination IDs. The Worker
uses the most recent IDs and rejects unknown identifiers and inconsistent route relationships.
After retirement, context IDs absent from the new catalog fail with HTTP 400 `invalid_request`;
inconsistent still-known relationships fail with `invalid_context`. These are request validation
outcomes, not evidence of a browser reset/retry implementation.

Future UI work must cancel superseded requests, suppress responses after reset/close even while
JSON parsing is pending, clear temporary context appropriately, and pass separate accessibility
and browser acceptance checks. Historical draft #69 Chrome observations are not rerun or claimed
for this stage. No persistent identity or transcript storage is introduced.

## Rate, budget, privacy, and failure behavior

The offline handler accepts injected rate-limit and budget decisions and calls them before the model.
Those interfaces receive only request ID and origin, never the question or answer. Test doubles
prove denial and failure paths; they are not durable global enforcement. Omitted controls allow
requests for offline use. Malformed supplied controls, rejected decisions and exceptions fail closed.
Request IDs are caller-supplied correlation tokens, not authenticated or guaranteed anonymous IDs;
real clients must not encode personal data in them or reuse them as persistent visitor identifiers.

`allowMissingOrigin` defaults to true for direct offline callers; setting it to false rejects
missing Origin headers. Allowed browser origins are matched exactly; no wildcard is emitted,
even if a literal `*` is configured. CORS is not authentication: non-browser clients can omit or
forge Origin, and an allowlist does not prevent public abuse.

The media type must be exactly `application/json` (case-insensitive, optional parameters); invalid
UTF-8 and JSON fail closed. The default body limit is 4096 bytes, question limit 300 characters,
and temporary context limit six identifiers total. Content-Length can reject early, but the
handler calls `request.arrayBuffer()` before checking actual bytes. An oversized undeclared body
is fully allocated before rejection: this is not streaming memory enforcement. No HTTP server is
included. Public deployment needs a bounded transport/platform and a separate streaming/body-read
review. The model timeout rejects late results and propagates cancellation, but cannot force a
noncooperative callback to stop consuming resources.

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

For a reviewed retrieval profile, the Worker also requires fact-level answerability before calling
the model. Topic aliases may establish relevance, but only reviewed fact-property bindings,
answerability phrases, and canonical fact content can authorize the requested information. A
property classifier may identify that a question asks about speed or capacity, but it cannot make
such a fact exist; the selected topic must contain an approved fact bound to that property. A same-topic request for an
unpublished property (for example fictional speed, price, load rating, or cleaning schedule)
returns the citation-free verified-answer fallback and no route. This is deterministic lexical
abstention, not semantic entailment. The 57-case development evaluation exercises the actual Worker, including contextual questions;
unsupported, ambiguous and conflicting cases are asserted to bypass generation. The 52 direct
cases retain 29/29 supported top-1 results, 41/41 expected facts, 0/16 unsupported false supports,
7/7 ambiguity/conflict outcomes, and 29/29 citation checks. These curated synthetic questions do
not establish production accuracy. The historical 30/44 generalization result is not remeasured;
see `GUIDE_DOCUMENT_RETRIEVAL.md`.

## Decisions required before a live connection

- Approval to change the locked static/no-backend architecture and project schedule.
- Cloudflare account, project, domain, deployment, secret-rotation, and incident owners.
- OpenAI organization/project owner, model evaluation, budget, and hard-stop thresholds.
- Production CORE sources, domain reviewers, approval rules, and rollback owner.
- Allowed production origins and public abuse/rate-limit policy.
- Privacy notice, minimized logging fields, access controls, and retention duration.
- Browser integration, accessibility, Edge, NVDA, provider-failure, and cost test sign-off.

Until those decisions are recorded, this Worker remains a local testable module only.

## Local verification and handoff differences

Run from this worktree in PowerShell:

```powershell
node --test test/guide-worker-handler.test.js
node --test test/guide-document-retrieval-e2e.test.js
node --test test/guide-retrieval-quality.test.js
$trackedTests = @(git ls-files -- 'test/*.test.js' 'tests/*.test.js')
node --test @trackedTests
npm.cmd run build
git diff --check origin/main...HEAD
```

The original handoff's 35 handler tests, three lifecycle/evaluation top-level tests (15 nested
scenarios), and seven retrieval-quality tests pass in its preserved reference worktree. Importing
unchanged into current main initially produced 37 passes / 23 failures out of 60 Node results:
fictional routes were correctly rejected by production conversation memory. The Worker-only
canonical resolver corrects that integration boundary without changing shared modules or fixtures.

Additional reproduced handoff defects fixed here: already-aborted requests started model calls;
false-valued malformed controls were treated as omitted; a literal wildcard Origin could be echoed
when explicitly allowlisted. A remembered production-zone route could also override fresh
ambiguous/conflicting retrieval; the Worker now gives that clarification precedence. Ten added
handler regressions cover those fixes, production route isolation, approved-only loading, duplicate/unoffered fact selection, noncooperative late completion,
request cancellation/privacy, and request-byte/media-type handling. The existing 57-case quality
loop additionally asserts exactly one model call for each answered question and zero for each
unsupported/ambiguous/conflicting question, after any context-establishing request.

No evaluation questions, expected outcomes or frozen fixture hashes are changed. The loader, mock
model, lifecycle test, and 15-case fixture retain their original Git blobs. This document describes
current scope instead of presenting future browser/provider work as integrated. Full verification
results are local Node/build checks, not automated GitHub test CI.

Original Stage 69D.1 local verification at c31ad94: handler 45/45 top-level tests; document retrieval 3/3 top-level tests
plus 15/15 nested scenarios (18 Node results); retrieval quality 7/7 top-level tests including all
57 fixed Worker scenarios. Complete tracked suite: 372/372 results, zero failures or skips
(357 top-level tests plus 15 nested subtests; previous main baseline 302).

Production build passed and its JS bundle is byte-identical to the preserved reviewed main-tree
build: SHA-256 `B677EC177A8123E6555171833D77B12E2EA478A13EDC4ACA3B4355518C833AD9`.
The existing 5,456.72 kB minified chunk warning and four high-severity dependency advisories remain;
no dependencies or lockfiles were changed. Whitespace checks passed. No frozen hash normalization
or Windows LF/CRLF workaround was needed for these eight files.

## Production routing classification security correction

Final review reproduced a classification bypass at the original local commit: validated synthetic
fixture copies labeled `production` still received a fictional route and started model generation.
The compatibility resolver checked canonical relationships but did not restrict its fallback to
synthetic knowledge. Canonical route validation also lacked a production zone policy check.

The correction is confined to the Worker handler, its test file, and this document. It preserves
all shared matcher, memory, orchestrator, schema and production tour files. Eight new top-level
regressions cover synthetic canonical routes, production rejection before generation (v1.0/v1.1),
all three real destination IDs and their follow-ups, answer-only topics, invalid remembered routes,
topic switching, caller classification/allowlist spoofing, malformed authoritative classification,
and ambiguity/conflict followed by recovery. Before the fix, three of these eight tests failed;
after the fix, all eight pass. Frozen evaluation datasets and expected outcomes remain untouched.

These are synthetic policy tests, including the copies carrying the `production` classification;
they are not real Rutgers facts, source approval, reviewer authentication or a backend activation.
The origin, distributed control, body buffering and noncooperative callback limitations documented
above remain. This correction does not establish public backend deployment readiness.

Correction verification: the eight new classification tests pass; the full handler has 53/53
top-level tests. Document retrieval remains 3/3 top-level plus 15/15 nested scenarios, and Worker
retrieval quality remains 7/7 top-level tests with all 57 fixed development cases unchanged.
Complete tracked Node suite: 380/380 results (365 top-level plus 15 nested), zero failures,
cancellations or skips. The production build passed and its JS SHA-256 remains
`B677EC177A8123E6555171833D77B12E2EA478A13EDC4ACA3B4355518C833AD9`.
These are local checks, not GitHub CI. The existing large-chunk warning remains. No dependency,
production source, frozen fixture or lockfile was changed; whitespace checks passed.
