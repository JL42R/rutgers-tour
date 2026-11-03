# Offline OpenAI Responses API adapter handoff

> **Status (2026-11-02).** Every #47 stage is merged into main: contracts/schema (#70), ingestion (#71), retrieval (#72), Worker handler (#73/#74), evaluations (#75), OpenAI adapter (#78), localhost bridge (#79) and development browser preview (#80). Wording below such as "this stage", "not integrated" or "remains in the handoff" describes this document's original checkpoint. Still true: all knowledge is synthetic, the provider is fake, nothing is deployed, and the production build excludes the preview. The AI guide is now a required single NPC that supplements the scripted guides; see `docs/PLAN.md` (2026-11-02 addendum).

Stage 69D.3 exercises a Responses-compatible boundary with injected fake HTTP responses. This is
not a live API integration or evidence of provider/account/model compatibility. It does not read
environment files, use a global `fetch`, create credentials, call OpenAI, deploy a Worker, or change
the production tour.

## Injection and Worker flow

`worker/src/openai-guide-model.js` exports `createOpenAIGuideModel(options)`. The returned object
implements the Worker's existing interface:

```js
model.generateResponse(modelRequest, { signal })
```

The existing `createGuideHandler` accepts either this object or `createMockGuideModel()` through its
unchanged `model` option. Unsupported and ambiguous questions remain deterministic Worker outcomes
and do not call a provider. For supported topics, the flow is:

```text
validated HTTP request -> approved knowledge -> deterministic topic/fact retrieval
  -> OpenAI adapter -> structured model result -> Worker validation
  -> server-owned citations and canonical route -> validated HTTP response
```

The adapter returns only `{ answerText, supported, topicId, usedFactIds }`. Specialist IDs,
destination zone IDs, source references, lifecycle state, and canonical directions are never model
output; the Worker reconstructs them from approved server-owned knowledge. After validating
selected fact IDs, the Worker also discards adapter/model answer prose and rebuilds the visitor
answer from those canonical fact contents. The adapter itself validates structure, not factual
approval: it must receive the already-approved projection from the trusted Worker loader.

## Required configuration

Construction requires all three values explicitly:

```js
const provider = createOpenAIGuideModel({
  fetchImpl,             // explicitly authorized server-side fetch implementation
  getApiKey,             // server-side secret accessor returning the provider key
  model: reviewedModel,  // explicitly reviewed identifier; there is no default
  maxOutputTokens: 300,  // optional, bounded to 1-1200
  requestTimeoutMs: 1500 // optional, bounded to 1-60000
});
```

For a future Cloudflare deployment, `getApiKey` should read an encrypted Worker secret from the
runtime binding. Never expose it through Vite, browser JavaScript, public knowledge, logs, tests, or
source control. The adapter requires an injected `fetchImpl` instead of silently using global fetch,
so offline tests can supply a fake transport without any global fallback. Injection is not a
network sandbox: a caller could deliberately supply a real transport, which is not authorized or
done in this stage. No real credential accessor, environment secret or default model is provided.

## Responses API request

The adapter sends `POST https://api.openai.com/v1/responses` with Bearer authorization and JSON. It
uses the configured model, `store: false`, a bounded `max_output_tokens`, no tools, and a strict
`text.format` JSON Schema. Every object schema sets `additionalProperties: false`. The schema permits
only answer text, a support decision, the already-selected topic ID, and IDs from the retrieved fact
allowlist.

The developer instruction tells the model to use only supplied approved knowledge; to treat the
visitor question and fact text as untrusted data; and never to invent people, equipment, rooms,
specialists, research capabilities, or directions. The adapter accepts at most 20 facts (matching the existing API response reference bound), each
with an ID of at most 128 characters and text of at most 1500 characters. Questions are bounded
to 300 characters and the three context values to 128 each. The user input is a JSON projection containing
only the question, selected topic, approved `{ id, text }` facts, allowed fact IDs, and bounded
temporary context. It contains no approval metadata or source/route authority.

Official references used for this implementation:

- [Responses API create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Responses migration and request-shape guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [API data controls](https://developers.openai.com/api/docs/guides/your-data)

## Response validation and failures

The adapter handles the raw Responses API `output` array rather than assuming the first output item
is a message. It explicitly rejects incomplete responses, refusals, missing output, unexpected
content types, contradictory error/incomplete metadata on completed envelopes, non-assistant
messages, unexpected/tool output items, invalid JSON, extra fields, mismatched topics, unsupported or duplicate fact IDs,
and model-generated route fields. The existing Worker validates the returned internal result again
before constructing citations and routing.

Safe adapter error codes are:

- `invalid_credentials` for HTTP 401/403 or an unavailable secret;
- `rate_limited` for HTTP 429;
- `provider_unavailable` for HTTP 5xx;
- `provider_error` for other non-success HTTP responses;
- `connection_failed`, `request_timeout`, or `request_cancelled` for transport failures;
- `invalid_response`, `empty_output`, `incomplete_response`, or `model_refusal` for provider
  envelope failures; and
- `invalid_structured_output` for invalid internal results or references.

Transport and JSON-reader exceptions are mapped to fixed safe errors, even when an injected
transport throws the exported adapter error class. Error payloads and credentials are not logged
or returned. Successful internal results can contain model prose; the Worker discards it before
creating visitor text. Reasoning metadata items are ignored; exactly one completed assistant
output-text result is required. Redirect following is explicitly disabled with redirect: error. No automatic retry is implemented because retrying can add cost. Any future retry
policy needs explicit approval, a strict attempt limit, idempotency analysis, and budget accounting.

## Cancellation, privacy, and activation

The adapter creates a request-scoped `AbortController`, forwards its signal to fetch, propagates the
injected Worker cancellation signal, and enforces its own timeout through HTTP body reading.
Browser integration is not part of this stage. Future browser integration should still
abort when dialogue closes or a newer question supersedes the request, and should keep the existing
stale-response version guard.

`store: false` avoids creating stored Responses application state for this request design, but it is
not a promise of zero retention under every account policy. The team must review the organization's
abuse-monitoring, Zero Data Retention eligibility, regional processing, and prompt-caching settings
before sending visitor content. This prototype creates no provider conversation object, persistent
memory, transcript store, profile, analytics, or database.

Live testing requires separate authorization for the backend architecture, OpenAI organization and
project, evaluated model identifier, secret creation and rotation, permitted test questions,
privacy policy, durable rate limits, provider project limits, usage alerts, hard spending cutoff,
incident ownership, and deployment target. The first authorized live test should use a dedicated
non-production project with the smallest approved limit and a fixed fictional evaluation set.

## Current stage, corrections, and verification

Only three new files are introduced: this document, the adapter module, and its tests. No local
HTTP server, Worker deployment entrypoint, browser/client wiring, OpenAI SDK, dependency, API key
or backend is added. Unsupported, ambiguous and conflicting questions bypass adapter credential
lookup and fake HTTP. Production routing remains limited to hallway, printing-room and
project-studio; fictional routes remain exclusive to validated synthetic_fixture knowledge.

Original/imported Git blob identities at pinned handoff 3d222dd29862abb6226d874ea5f937fcd7a29952:

| File | Original blob (identical immediately after import) |
|---|---|
| worker/src/openai-guide-model.js | 7d7fbacc25097372a110f4afb9a90dd5fe413968 |
| test/openai-guide-model.test.js | 501e4b62e5304e439df855e6f2e0ab5718519b18 |
| docs/GUIDE_OPENAI_ADAPTER.md | 01db2406c207007390c1832eb3058c7d758c359a |

The untouched original tests passed 37/37 Node results (30 top-level and seven nested), including
the original Worker integration path. Thirteen added top-level fake-HTTP regressions exposed five
adapter gaps before correction: fact count was unlimited; completed envelopes could accept
contradictory error metadata/non-assistant/tool items; transport-thrown adapter errors could leak
raw code/message values; redirect following was not explicitly forbidden; and cancellation after
key resolution could still dispatch the scheduled transport callback. Minimal changes inside the
adapter address those five issues, including a signal check immediately before dispatch. New tests also cover noncooperative late fetch/body
completion, pre-cancellation and cancellation during key lookup, full canonical reconstruction,
unoffered approved facts, unsupported/conflicting bypass, all production zone policies, and
redacted provider errors through the actual Worker. No existing Worker or production source is
changed. The complete adapter file now passes 50/50 results (43 top-level + seven nested).

## API uncertainties and remaining deployment limits

Official documentation was checked for structured text.format/schema and store: false; references
above describe the request shape, not a live compatibility test. No provider endpoint was called,
model selected, project access checked, pricing verified or real response captured. Before any
separately authorized live work, validate the selected model's strict-schema support, developer
role, token parameters, timeout/latency behavior and the runtime fetch implementation. New provider
output item types deliberately fail closed; only reasoning metadata and a completed assistant text
message are accepted. Refusal, incomplete output and provider errors remain safe failures.

The request's fact count and fields are bounded, but response.json() buffers/parses the provider
body before structured validation: this is not streaming response-size enforcement. The adapter
HTTP timer begins after getApiKey resolves; the injected trusted key callback has no independent
adapter deadline. The outer Worker timeout still fails the visitor request safely. Signals and
Promise.race reject late accepted results but cannot force noncooperative callbacks to stop.
Adapter transport/HTTP errors are deliberately mapped by the current Worker to a generic
provider_unavailable response; the Worker's own timeout retains provider_timeout. No changes to
that existing contract or failure policy are included.

CORS is not authentication, injected rate/budget controls are not distributed enforcement, review
metadata is not reviewer authentication, and factual approval/retrieval accuracy are separate from
structured output. The preserved 30/44 synthetic challenge remains a limitation, not evidence of
production accuracy. The original data-controls and live-activation requirements above still
apply. No automatic retries or live spending are enabled.

Reproduce locally with fake HTTP only (PowerShell):

```powershell
node --test test/openai-guide-model.test.js
$trackedTests = @(git ls-files -- 'test/*.test.js' 'tests/*.test.js')
node --test @trackedTests
npm.cmd run build
git diff --cached --check
```

On this Windows fresh worktree, three frozen hash checks initially failed solely because Git
converted their LF checkout bytes to CRLF. The exact committed LF blobs were restored after
confirming that line endings were the only difference. No question, expectation, hash, Git blob
or earlier evaluation worktree was modified. This checkout limitation remains relevant to future
Windows reproductions. These tests and build are local verification, not GitHub Node-test CI.

Final Stage 69D.3 verification: adapter 50/50 Node results (43 top-level + seven nested); existing
Worker/retrieval/frozen focus 109/109; complete tracked suite 442/442 (420 top-level + 22 nested),
zero failures/skips/cancellations. The 392-result main baseline is preserved plus 50 adapter results.
Frozen outcomes remain retrieval holdout 20/20, answerability development 20/20, answerability
holdout 30/30 and generalization 30/44. All 14 historical generalization failure IDs are unchanged.
The frozen tests retain their original inline fake models; self-contained tests additionally cover
the adapter through the real Worker with injected fake HTTP. No live model quality is established.

Production build passed, staged whitespace passed, and JS bundle SHA-256 remains
`B677EC177A8123E6555171833D77B12E2EA478A13EDC4ACA3B4355518C833AD9`.
The existing bundle-size warning, four dependency advisories and Windows checkout caveat remain.
Exactly three new files are staged; no existing main file, dependency, lockfile or frozen Git blob
changes. Complete regression, checkout and final verification evidence stays in ignored
`tmp/stage69d3/` and is not part of the commit. No push, PR or deployment is performed.
