# Development-only localhost CORE Guide browser preview

> **Status (2026-11-02).** Every #47 stage is merged into main: contracts/schema (#70), ingestion (#71), retrieval (#72), Worker handler (#73/#74), evaluations (#75), OpenAI adapter (#78), localhost bridge (#79) and development browser preview (#80). Wording below such as "this stage", "not integrated" or "remains in the handoff" describes this document's original checkpoint. Still true: all knowledge is synthetic, the provider is fake, nothing is deployed, and the production build excludes the preview. The AI guide is now a required single NPC that supplements the scripted guides; see `docs/PLAN.md` (2026-11-02 addendum).

Stage 69E.2 connects the existing hallway CORE Guide Dialogue to the localhost Worker bridge and
its fake Responses-compatible provider. Visitor-to-bridge HTTP is real loopback HTTP; upstream
provider HTTP is simulated in memory. There is no real OpenAI request, real API key, online search,
approved real Rutgers CORE knowledge, public backend or public AI activation.

## Start locally (PowerShell)

Use two terminals in the repository root. Backend:

```powershell
Set-Location C:\dev\rutgers-tour
node dev/guide-local-server.js --profile retrieval-quality
```

Vite, in the second terminal:

```powershell
Set-Location C:\dev\rutgers-tour
npm.cmd run dev -- --host 127.0.0.1 --port 4179 --strictPort
```

Open:

[Development preview](http://127.0.0.1:4179/?guideMock=1&guideBackend=local&guideProfile=retrieval-quality)

If dependencies are absent in a fresh clone, install the existing lockfile with `npm.cmd ci`.
No dependency or package script is added by this stage.

The backend binds only to `127.0.0.1:4188` and allows the fixed normal CLI origin
`http://127.0.0.1:4179`. The browser endpoint is fixed at
`http://127.0.0.1:4188/guide`, with no alternate host, credentials, path or redirect following.
The advanced profile must be selected on both sides. For the smaller default synthetic profile,
omit `--profile retrieval-quality` and omit `guideProfile` from the URL.

## Use the existing guide

1. Let the actual hallway load. Its automatic welcome remains scripted, with its normal Close
   button and no experimental question option.
2. Close that welcome, approach the existing hallway CORE Guide, and press E.
3. Continue through its scripted conversation. At its normal ending, choose
   **Ask a development question**.
4. A DEVELOPMENT PREVIEW disclosure identifies the fictional corpus and fake provider. Type a
   question of at most 300 characters. The pending state is replaced by a validated server answer,
   clarification, unsupported fallback or friendly backend-unavailable message.
5. Ask another question for a follow-up, return to normal dialogue, or press Escape to close.
   Returning/closing resets temporary context and invalidates pending work. Focus returns to the
   previous usable element or the tour app; click the canvas again when mouse-look capture is needed.

Verified advanced-profile examples:

- `Could you explain why articulated paper devices rotate after a gentle tug?`
- `Where can I find them?` after the preceding answer.
- `Why do crystal plants cast colors across the display?`
- `How do paper light patterns work?` (clarification).
- `How long does the echo fountain repeat its note?` (approved-source conflict).
- `What is the weather tomorrow?` (unsupported fallback).

Default-profile examples are `How do folded machines move?`, `Where can I find them?`, and
`Tell me about glass gardens.`. Other wording may abstain under the unchanged deterministic
retrieval policy. All subjects, specialists and destinations in these examples are fictional.

Fictional directions are informational text only. They never move the camera, select a zone or
create a real navigable room. Existing NPC identity, positions and scene data are unchanged.
Preview responses do not award completion; existing scripted terminal and legacy echo completion
rules remain in control. Non-preview NPC conversations and discoverability keep their current behavior.

## Activation and production isolation

The only automatic registration is inside a literal Vite `import.meta.env.DEV` compile-time
guard in current `src/main.js`. Both exact flags `guideMock=1` and `guideBackend=local` are
required before dynamically importing `guide-hallway-local.js`. The optional `guideProfile`
accepts only `retrieval-quality`; absence selects the default catalog. Arbitrary profiles fail
closed. No global test helper is exposed by the application.

The connector registers one optional question provider for `hallway-guide`; it creates no NPC.
Current `main.js` is retained, including equipment, collisions, welcome, tracker, camera and
D1/D3/Room 116 logic. Current `dialogue.js` gains only an optional provider lifecycle, pending/result
UI and cancellation guards. Without a provider, normal scripted behavior and the existing AI TEST
echo remain available as before. The automatic welcome explicitly opts out of the provider.

Production builds remove the guarded import and do not include the local connector, browser HTTP
client, fictional catalogs, localhost endpoint or activation flags. The shared Dialogue extension
changes production JavaScript bytes legitimately; byte identity with the earlier production hash
is not claimed. The intentionally dormant optional Dialogue API and scripted-welcome opt-out are
the only shared runtime changes.

To turn off the preview, remove either activation flag and reload the normal Vite URL. Production
builds ignore these flags. Stop each local server with Ctrl+C in its terminal. Automated verification
closes its owned servers and browser process; it leaves its ignored diagnostic artifacts intact.

## Validation, cancellation and privacy

The browser sends schema-v1.1 requests with correlated request IDs and bounded ID-only temporary
context. It validates response shape, fact/source IDs, canonical specialist/destination names,
directions, knowledge version and HTTP/outcome consistency. The Worker owns factual approval and
canonical answer reconstruction; browser shape validation is not independent factual verification.

The Worker discards fake-provider prose and reconstructs facts, citations and directions from the
approved synthetic fixture. Unsupported, ambiguous and conflicting questions bypass the provider.
Production routing remains limited to hallway, printing-room and project-studio; fictional routing
requires validated synthetic classification. No Worker, adapter, knowledge or HTTP-server module changes.

Requests omit credentials/referrers, use no-store and reject redirects. Reset, supersession and the
bounded timeout race both fetch and JSON reading; version checks after each await prevent late
context restoration. External errors are mapped to fixed safe messages without raw causes.
Noncooperative callbacks may continue after cancellation, but their late answers cannot be accepted.

Backend text uses textContent, never HTML rendering. Closing the preview clears its DOM text/form
and ID context. The app does not persist questions, answers or transcripts. Existing Tour Progress
storage still contains completion IDs only. New provider failures never log raw exception objects.
Opt-in narration remains opt-in and follows pending/result text; these tests are not NVDA acceptance.

CORS is not authentication. Trusted Node harness injection is not a public browser/HTTP configuration
surface. Existing backend body limits and disabled-by-default fixed test-only knowledge transitions
are unchanged. Ordinary demos omit `--test-controls`; no arbitrary document ingestion/publication,
distributed budgets or production identity is introduced.

## Import provenance and differences from the preserved handoff

Base main: `d81968932c237290d2fe9a5db8ad93ef4e56e7fd`.
Preserved handoff: `3d222dd29862abb6226d874ea5f937fcd7a29952`.

The initial raw imports exactly matched:

| File | Original and initial imported Git blob |
|---|---|
| src/guide-local-api.js | 13722ac2c138dd94d118bec6a70074a4de97fd3d |
| src/guide-local-profiles.js | 39cc2bad1eefa4eae8cde62b5b5192d45e3fabb2 |
| test/guide-local-api.test.js | bc6cd75af935e92a9de025ce6bace17ec733c5a5 |

The original API tests passed 10/10 unchanged. Six added regressions first reproduced client gaps.
The new client corrections reject endpoint userinfo/redirect following, race noncooperative fetch
and JSON reading against cancellation/timeout, recheck versions after body reading, sanitize external
errors without raw causes, and reject inconsistent HTTP status/answer envelopes. The catalog module
remains byte-identical to the handoff. The original ten tests are preserved alongside the six additions.

The new hallway-local connector reuses only the localhost session/catalogs. It does not import the
historical in-browser preview model or preview knowledge modules. It preserves stale outcomes,
formats only validated names/directions/source IDs, and explicitly marks routes as fictional text.
Current main/Dialogue were patched rather than replaced by historical versions. Additional focused
Dialogue tests exercise current completion, discoverability, narration, focus and late-response rules.
No original browser E2E file or obsolete production assumption was copied unchanged.

## Verification and limits

Actual local Node results:

| Check | Passed |
|---|---|
| Imported API before modification | 10/10 |
| Final browser API | 16/16 |
| Hallway connector | 6/6 |
| Real loopback browser-client E2E | 8/8 |
| Dialogue integration | 17/17 |
| Existing NPC + Room 116 regressions | 67/67 (12 + 55) |
| Complete tracked Node suite | 520/520 (498 top-level + 22 nested) |

The complete suite includes the unchanged local HTTP, adapter, Worker, contract, conversation,
document/retrieval and all four frozen evaluation tests. Zero failures, skips or cancellations.
Frozen outcomes remain retrieval 20/20, answerability development 20/20, answerability holdout 30/30
and generalization 30/44, retaining all 14 historical failures. Fixture bytes/hashes and expectations
are unchanged. These are local synthetic results, not GitHub Node-test CI or production accuracy.

Headless Chrome's actual tour reached the initial scripted welcome, but its automated proximity
walk to the existing guide timed out. The verified interactive fallback used a separate ignored
DOM harness with the real Dialogue, connector, Worker/adapter and localhost HTTP. It passed canonical
answer, follow-up, unsupported fallback, backend-off error and close/focus checks with four loopback
POSTs and zero external provider requests. That is DOM/HTTP coverage, not a completed 3D walkthrough.

The production page was loaded with preview flags and made no local-provider request or disclosure.
Its captured software-WebGL screen was still loading; production visual/navigation acceptance is
not claimed. Built-code inspection independently confirms the development modules, catalog, endpoint
and flags are absent and the legacy echo remains. Browser tools failed to initialize in this
environment; the fallback used an isolated headless Chrome harness. Its first attempt hit a Windows
Vite watcher error from a test Chrome profile inside the repository; the successful retry placed the
new profile outside Vite's watched tree. Earlier diagnostics were preserved; no application change
was made for that tooling issue.

Production build and whitespace checks passed. Production JavaScript SHA-256:
`DCC94E514FF541B7A85197FBDC31AD2EBD83DCB2F3AF49D9B0D3E9BD646309BE`.

It differs from the inherited `527FF0E45A0ADFA9A2EFA76FC90E87818F09DC5581078B5926F17BBEF9D6FE2C`
baseline because of the authorized shared Dialogue/main integration; it is not byte-identical.
The existing large-bundle warning and four recorded dependency advisories remain. No dependency fix.

A genuine manual hallway approach/E-key walkthrough, hardware-rendered three-zone regression,
actual NVDA acceptance and team content/privacy/security approval remain required before any public
AI work. No real model, cost, latency, retention, authentication or distributed spending control has
been validated. This stage does not authorize a live provider, production backend or another stage.
