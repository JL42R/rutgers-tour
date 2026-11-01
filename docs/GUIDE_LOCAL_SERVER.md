# Offline localhost Guide HTTP bridge

Stage 69E.1 adds real loopback HTTP to the existing Worker and Responses-compatible adapter,
using an internal fake provider only. It does not connect the public tour, NPCs or browser UI,
call OpenAI, use real credentials, deploy a backend or establish production readiness.

## Start and stop (PowerShell)

From this worktree:

```powershell
node dev/guide-local-server.js
```

The server binds **127.0.0.1:4188** only. The default allowed browser origin is
**http://127.0.0.1:4179**. No browser client is included in this stage. Press **Ctrl+C** to close
the server; SIGINT/SIGTERM invoke its shutdown handler. Node tests use OS-assigned port 0 and
close every server in finally blocks. No package script or dependency was added.

An optional fixed advanced fictional profile is available:

```powershell
node dev/guide-local-server.js --profile retrieval-quality
```

The only profiles are `default` (the existing core synthetic fixture) and
`retrieval-quality` (the existing synthetic retrieval-quality fixture/profile).
These contain fictional rooms and people, not approved Rutgers subject-matter content.
There is no arbitrary file, document, URL or knowledge-path selector.

## HTTP path and request

`POST /guide` maps incoming Node HTTP to a Web Request for the existing Worker:

loopback HTTP → request/CORS contract → approved synthetic knowledge → deterministic retrieval
→ existing Worker → hardened adapter → injected fake HTTP response → structured validation
→ canonical Worker answer, citations and route.

For example, in a second PowerShell window:

```powershell
$body = @{
  schemaVersion = '1.1'
  requestId = 'local-manual-001'
  question = 'How do folded machines move?'
  temporaryContext = @{
    topicIds = @()
    specialistNpcIds = @()
    destinationZoneIds = @()
  }
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Uri 'http://127.0.0.1:4188/guide' -Method Post -ContentType 'application/json' -Headers @{ Origin = 'http://127.0.0.1:4179' } -Body $body
```

Allowed-origin `OPTIONS /guide` returns CORS preflight metadata without invoking the provider.
Foreign/missing origins are rejected by default, unsupported methods return 405, and other paths
or query selectors return 404. JSON/schema/content-type errors fail safely. The Worker enforces
its existing 4096-byte request bound; the bridge's outer 8192-byte transport cap destroys an
oversized connection (a client may see ECONNRESET rather than a JSON 413).
Responses are not visitor transcripts and must not be stored as such.

## Fake provider and canonical authority

The CLI always constructs the internal fake provider, the literal fictional
`local-fixture-key-not-a-secret` and `local-fixture-model`. There is no global fetch fallback,
environment-secret read, SDK, real model selection or retry. The provider endpoint string is
checked by an in-memory fake function; it never performs I/O. Only loopback traffic is real.

Both success and refusal fake envelopes include a completed `role: assistant` message, matching
the current hardened adapter. The fake exposes success, refusal, unknown-fact and HTTP-error
modes, delay, observations and malicious prose only through Node test configuration. Custom
transport/knowledge injection is available to the trusted Node harness; it is not a CLI flag or
HTTP capability. There are no live provider URL, credential, host, fetch or arbitrary path flags.

The adapter retains the 20-fact bound, strict provider/structured validation, safe external errors,
redirect rejection and pre-dispatch cancellation check. Tools, invented IDs and model-owned route
fields cannot become answers. The Worker discards provider prose and reconstructs text,
fact/source references, specialist, destination and directions from approved server-owned data.
Unsupported, ambiguous and conflicting retrieval outcomes bypass the fake provider.

Production classifications retain the existing hallway / printing-room / project-studio restriction.
Fictional routes are allowed only for validated synthetic-fixture knowledge. Request fields cannot
spoof that classification. Test fixtures relabeled as production test the structural guard only;
they are not production factual approval.

## Fixed test-only knowledge transition

Disabled by default, including with the retrieval-quality profile. Explicit local test setup is:

```powershell
node dev/guide-local-server.js --profile retrieval-quality --test-controls
```

This enables `POST /guide-test/advance-knowledge` with the exact default local browser origin.
The control takes no document, path, approval or visitor-data input: it invokes a zero-argument
switch to the prebuilt retired-cloud synthetic snapshot. The historical endpoint does not consume
request-body data. It never ingests submitted documents or writes files, shared fixtures, approval
records or published knowledge. A repeat transition returns 409. Other methods/origins are rejected;
query selectors are not accepted. It cannot be enabled for the default profile or a custom loader.

This is a development fixture control, not a production administration API. It has no production
deployment wiring. Origin checking is not authentication against other local processes; do not
expose this process through a proxy, tunnel or public interface.

## Tests and reproduction

```powershell
node --test test/guide-local-server.test.js
node --test test/openai-guide-model.test.js
node --test test/guide-worker-handler.test.js
node --test test/guide-document-retrieval-e2e.test.js
node --test test/guide-retrieval-holdout.test.js test/guide-answerability-development.test.js test/guide-answerability-holdout.test.js test/guide-generalization-challenge.test.js
$trackedTests = @(git ls-files -- 'test/*.test.js' 'tests/*.test.js')
node --test @trackedTests
npm.cmd run build
git diff --cached --check
```

Stage the new test before the tracked-suite command. Every HTTP test uses finite timeouts, an
ephemeral IPv4 loopback listener, and finally cleanup. Node HTTP clients reject external targets,
and a throwing global-fetch guard detects any provider fallback. No original browser E2E module
or browser runner is imported.

The imported server blob is `947b857212c996fd2056a3ceccb880ba0491bcfa` at preserved handoff
`3d222dd29862abb6226d874ea5f937fcd7a29952`; it matched byte-for-byte before editing.
The only server changes are the two assistant-role envelope fields. Tests and this document are new.
Existing main files, Worker, adapter, frozen data, dependencies, frontend and production assets
must remain unchanged.

## Remaining limits

This is a localhost development bridge, not a public backend. CORS is not authentication;
production identity, distributed budgets/rate controls and deployment hardening remain absent.
It inherits the existing adapter's buffered provider-body parsing, credential-callback deadline
and noncooperative-cancellation limitations. No real provider conformance, account/model behavior,
latency, cost or retention policy was tested. `store: false` is not a universal zero-retention guarantee.

The historical synthetic evaluation outcomes must remain 20/20 retrieval holdout, 20/20
answerability development, 30/30 answerability holdout and **30/44 generalization**, preserving all
14 known failures. Passing the challenge regression reproduces that measurement; it does not mean
44 correct answers. These are synthetic/local measurements, not production accuracy or GitHub CI.

Stage 69E.1 must preserve production JavaScript byte identity relative to its current base commit.
For current main `af42c9327ab079e17e332de97843dc4b2f3ef9d2` (after PR #77), the production
JavaScript SHA-256 is
`527FF0E45A0ADFA9A2EFA76FC90E87818F09DC5581078B5926F17BBEF9D6FE2C`.
The pre-PR #77 hash is historical and is recorded below; it is not the current requirement.
Build-size warnings and existing dependency advisories are outside this stage's scope.

## Historical local verification before PR #77 (superseded)

Original base main: `f164120684e312a7bbd03500cb3eafc54662ab98`.

- New loopback HTTP tests: **27/27**.
- Hardened adapter: **50/50**.
- Worker handler: **61/61**.
- Document retrieval/lifecycle: **18/18** (three top-level plus 15 nested).
- Four frozen evaluation tests: **4/4**, retaining 20/20, 20/20, 30/30 and 30/44 outcomes
  and the same 14 generalization failures.
- Complete tracked Node suite: **469/469** (447 top-level plus 22 nested), with no failures,
  skips or cancellations; the existing 442 results plus 27 new HTTP results.
- Production build and staged whitespace checks passed. Historical production JavaScript SHA-256:
  `B677EC177A8123E6555171833D77B12E2EA478A13EDC4ACA3B4355518C833AD9`.

These are actual local results, not GitHub Node-test CI. The initial unmodified-envelope HTTP
request failed with 503; adding the two assistant-role fields corrected the compatibility issue.
All fake-transport test observations remained local, and no global/external provider fetch occurred.

The new Windows worktree initially checked out three frozen fixture files as CRLF. Their exact
committed LF bytes were restored only after proving line endings were the sole difference.
No fixture Git blob, question, expectation, hash, approval record or persistent Git configuration
changed. Checkout identity records and complete diagnostic logs stay in ignored `tmp/stage69e1/`.

## Current reconciliation verification after PR #77

Current base main: `af42c9327ab079e17e332de97843dc4b2f3ef9d2`.

These reconciled results supersede the historical pre-PR #77 base, complete-suite count and
production bundle hash above. PR #77 added NPC discoverability tests and legitimately changed
the production bundle; the localhost bridge does not change that new production baseline.

| Local check | Reconciled result |
|---|---|
| Local HTTP tests | 27/27 |
| Hardened adapter | 50/50 |
| Worker handler | 61/61 |
| Document retrieval/lifecycle | 18/18 (three top-level + 15 nested) |
| Frozen evaluation Node tests | 4/4 |
| Complete tracked Node suite | 473/473 (451 top-level + 22 nested) |
| Production build | Passed |
| Whitespace checks | Passed |

There were zero failures, skips or cancellations. These are local verification results, not
automated GitHub Node-test CI. Frozen question-level outcomes remain retrieval holdout 20/20,
answerability development 20/20, answerability holdout 30/30 and generalization challenge 30/44.
All 14 historical generalization failures remain preserved. These are synthetic offline
evaluations, not evidence of real model compatibility or production accuracy.

Current production JavaScript SHA-256:
`527FF0E45A0ADFA9A2EFA76FC90E87818F09DC5581078B5926F17BBEF9D6FE2C`.

Byte identity was verified by comparing the JavaScript from the successfully deployed
[new-main GitHub Pages workflow](https://github.com/JL42R/rutgers-tour/actions/runs/41354572802)
for the exact current base commit with the Stage 69E.1 local production build. Both have the
current hash above and match byte-for-byte. No browser AI, live provider or backend is activated.
