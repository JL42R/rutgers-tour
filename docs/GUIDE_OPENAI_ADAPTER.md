# Offline OpenAI Responses API adapter handoff

This adapter proves the real provider boundary with injected fake HTTP responses. It does not read
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
output; the Worker reconstructs them from approved server-owned knowledge.

## Required configuration

Construction requires all three values explicitly:

```js
const model = createOpenAIGuideModel({
  fetchImpl,             // explicitly authorized server-side fetch implementation
  getApiKey,             // server-side secret accessor returning the provider key
  model,                 // reviewed model identifier; there is deliberately no default
  maxOutputTokens: 300,  // optional, bounded to 1-1200
  requestTimeoutMs: 1500 // optional, bounded to 1-60000
});
```

For a future Cloudflare deployment, `getApiKey` should read an encrypted Worker secret from the
runtime binding. Never expose it through Vite, browser JavaScript, public knowledge, logs, tests, or
source control. The adapter requires an injected `fetchImpl` instead of silently using global fetch,
which prevents this offline prototype from accidentally making a live request.

## Responses API request

The adapter sends `POST https://api.openai.com/v1/responses` with Bearer authorization and JSON. It
uses the configured model, `store: false`, a bounded `max_output_tokens`, no tools, and a strict
`text.format` JSON Schema. Every object schema sets `additionalProperties: false`. The schema permits
only answer text, a support decision, the already-selected topic ID, and IDs from the retrieved fact
allowlist.

The developer instruction tells the model to use only supplied approved knowledge; to treat the
visitor question and fact text as untrusted data; and never to invent people, equipment, rooms,
specialists, research capabilities, or directions. The user input is a JSON projection containing
only the question, selected topic, approved `{ id, text }` facts, allowed fact IDs, and bounded
temporary context. It contains no approval metadata or source/route authority.

Official references used for this implementation:

- [Responses API create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [API data controls](https://developers.openai.com/api/docs/guides/your-data)

## Response validation and failures

The adapter handles the raw Responses API `output` array rather than assuming the first output item
is a message. It explicitly rejects incomplete responses, refusals, missing output, unexpected
content types, invalid JSON, extra fields, mismatched topics, unsupported or duplicate fact IDs,
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

Raw provider bodies, provider error messages, questions, answers, and credentials are never logged
or returned. No automatic retry is implemented because retrying can add cost. Any future retry
policy needs explicit approval, a strict attempt limit, idempotency analysis, and budget accounting.

## Cancellation, privacy, and activation

The adapter creates a request-scoped `AbortController`, forwards its signal to fetch, propagates the
Worker/browser cancellation signal, and enforces its own timeout. Browser integration should still
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
