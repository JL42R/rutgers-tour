# AI CORE Guide teammate handoff

Verified 2026-10-30 for Issue #47 on branch `feat/issue-47-local-e2e`.

## A. Project goal

The AI CORE Guide prototype lets a visitor approach the existing hallway guide, complete its normal
scripted welcome, and type natural-language questions. The intended production feature should answer
only from approved Rutgers CORE knowledge or route the visitor to an approved specialist and
destination. Unknown, ambiguous, conflicting, or insufficiently supported questions must fail
safely rather than inventing facts or directions.

This branch is a development handoff baseline. It does not approve a production backend, a live
model, real provider credentials, or real Rutgers CORE knowledge. The published production build
remains static and scripted-only.

## B. Current implementation

Completed and working in the local development preview:

- Reuses the single configured hallway CORE Guide; no duplicate NPC or calibrated position is added.
- Preserves the automatic scripted welcome, E-key replay, Johnny/Vishan scripted conversations,
  narration, tracker callbacks, keyboard controls, focus restoration, and zone behavior present at
  the branch base.
- Adds a development-only typed-question path to the existing DOM Dialogue interface.
- Validates versioned browser/Worker request and response envelopes.
- Loads only approved records from fictional, repository-controlled knowledge fixtures.
- Supports deterministic topic matching, document ingestion into draft candidates, explicit
  review/approval/retirement transitions, approved-only retrieval, bounded ID-only conversation
  context, topic switching, specialist expertise and destination follow-ups, source references,
  friendly names, and canonical directions.
- Detects ambiguity, approved-source conflicts, stale context after a knowledge-version change,
  unsupported properties, malformed responses, provider failures, timeout, rate denial, and budget
  denial. These paths fail closed.
- Includes an OpenAI Responses-compatible server adapter exercised only through an injected fake
  HTTP transport. No real OpenAI request is made.
- Runs the Worker-compatible handler through real loopback HTTP for local integration testing.
- Keeps local activation behind Vite development mode plus explicit query flags. The production
  build contains only the scripted hallway conversation.
- Records a 44-case prospectively frozen synthetic generalization challenge. It passed 30/44 exact
  Worker outcomes, with zero false support on 13 unsupported direct cases. This is useful diagnostic
  evidence, not production accuracy or a human-authored blind evaluation.

## C. Current architecture

The actual local preview path is:

```text
Existing 3D hallway CORE Guide
  -> existing DOM Dialogue UI and typed-question action
  -> development-only browser client
  -> POST http://127.0.0.1:4188/guide
  -> local Node HTTP bridge
  -> Worker-compatible request handler
  -> validated approved-only fictional knowledge and retrieval profile
  -> OpenAI Responses-compatible adapter
  -> mandatory injected fake provider transport
  -> model result validation and canonical answer reconstruction
  -> validated browser response
  -> existing Dialogue UI
```

The Worker, not the browser or simulated model, owns approval state, fact/source relationships,
specialist IDs, friendly names, destination IDs, and canonical directions. The provider may select
only offered fact IDs. The handler discards provider prose and rebuilds the displayed answer from
approved canonical facts.

Production follows a different path: the development flags are compiled out, the local backend is
not contacted, and the existing scripted dialogue remains the only behavior.

## D. Important files

- `src/main.js` - installs the local Guide provider only in development mode and only for the
  existing hallway guide.
- `src/dialogue.js` - existing visual-novel dialogue, typed-question UI, focus handling, narration,
  completion, request cancellation, and safe rendering.
- `src/guide-hallway-mock.js` - development-only bridge from Dialogue to the provider-neutral Guide
  pipeline.
- `src/guide-local-api.js` and `src/guide-local-profiles.js` - loopback browser client, response
  validation, bounded context, and fixed profile allowlist.
- `src/guide-api-contract.js` - exact v1.0/v1.1 request and response schemas.
- `src/guide-qa.js`, `src/guide-conversation.js`, and `src/guide-ai-orchestrator.js` - deterministic
  matching, temporary conversation state, and provider-neutral orchestration.
- `src/guide-knowledge-schema.js`, `src/guide-knowledge-compat.js`,
  `src/guide-knowledge-retrieval.js`, and `src/guide-retrieval-profile.js` - lifecycle validation,
  approved-view conversion, lexical retrieval, answerability, and reviewed profile metadata.
- `src/guide-document-ingestion.js` and `src/guide-knowledge-administration.js` - bounded document
  preparation and simulated trusted lifecycle transitions. Neither is a public editor.
- `worker/src/approved-knowledge.js` and `worker/src/guide-handler.js` - authoritative knowledge
  loading, retrieval, CORS/request checks, grounding, canonical reconstruction, and safe failures.
- `worker/src/openai-guide-model.js` - strict Responses API adapter. It requires injected fetch,
  secret accessor, and model name, so it cannot silently make a live request.
- `worker/src/mock-guide-model.js` - deterministic local model used by offline tests.
- `dev/guide-local-server.js` - localhost-only Node bridge with the mandatory fake provider.
- `dev/chrome-guide-smoke.js` - Chrome DevTools runner for success, advanced retrieval/lifecycle,
  backend failure, keyboard/focus behavior, narration, and production isolation.
- `knowledge/` and `knowledge/documents/` - fictional fixtures and recorded synthetic evaluations;
  these are not approved Rutgers CORE content.
- `test/` and `test-support/` - contract, retrieval, lifecycle, Worker, adapter, local HTTP, and
  generalization regression coverage.
- `docs/GUIDE_*.md` - architecture, knowledge intake, document retrieval, Worker, adapter, local
  preview, and this handoff.

## E. How to run the project

Use PowerShell. Node dependencies are already present in the current worktree. If a fresh checkout
does not have `node_modules`, install the locked dependencies once:

```powershell
Set-Location C:\dev\rutgers-tour-issue47-local-e2e
npm.cmd install
```

For the most complete fictional local demo, open two PowerShell windows.

Window 1 - start the local backend with the fixed retrieval profile:

```powershell
Set-Location C:\dev\rutgers-tour-issue47-local-e2e
npm.cmd run guide:local -- --profile retrieval-quality
```

Window 2 - start Vite on the origin allowed by the local server:

```powershell
Set-Location C:\dev\rutgers-tour-issue47-local-e2e
npm.cmd run dev -- --host 127.0.0.1 --port 4179 --strictPort
```

Open the development preview in Chrome:

```powershell
Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "http://127.0.0.1:4179/?guideMock=1&guideBackend=local&guideProfile=retrieval-quality"
```

Close the automatic welcome, approach the existing CORE Guide, press E, finish its short scripted
branch, and choose **Ask a question**. Stop each server with Ctrl+C in its own PowerShell window.

Run the complete automated suite and production build:

```powershell
Set-Location C:\dev\rutgers-tour-issue47-local-e2e
npm.cmd test
npm.cmd run build
```

Normal production behavior can be checked with `npm.cmd run preview`; do not add the development
query flags when evaluating the production path.

## F. Sample fictional questions

These questions worked in the verified advanced local preview:

- `How do the origami contraptions rotate when I tug them?`
- `Which colored tabs identify the repeating fold's reset points?`
- `Where can I find them?`
- `Tell me about the prism greenhouse.`
- `What color is the signal crystal?` - demonstrates approved-source conflict handling.
- `What is the maximum safe speed of paper automata?` - demonstrates unsupported-property refusal.

All names, locations, facts, and routes returned by this preview are intentionally fictional.

## G. Known limitations

- The provider is simulated. No response is generated by OpenAI or another live model.
- All knowledge and documents are synthetic fixtures; there is no approved Rutgers CORE corpus.
- Retrieval is deterministic and lexical. It remains over-conservative on novel wording and
  multi-property questions.
- The 57-case regression, examined 20-/30-case sets, and 44-case challenge are synthetic. The last
  challenge was Codex-authored and is not a teammate-authored blind benchmark.
- The frozen 44-case challenge reached 30/44 complete Worker outcomes, 11/20 supported Top-1,
  17/30 expected-fact recall, 9/20 citation correctness, and 0/13 false support.
- There are no live provider credentials, durable shared rate limits, hard spending controls,
  production authentication, cloud deployment, or incident/rollback automation.
- Actual NVDA screen-reader acceptance remains unresolved under Issue #33. Automated live-region and
  keyboard checks are not a substitute for manual NVDA testing.
- This branch predates current `main` and does not contain the Room 116, equipment collision, or
  latest NPC discoverability work. Do not treat it as an updated production branch.
- The large checkpoint overlaps files now merged through PRs #48 and #59 and files still reviewed in
  PR #61. It is a handoff baseline, not a conflict-free merge candidate.

## H. Security and privacy

- No API key is placed in browser code, Vite variables, fixtures, logs, or source control.
- The adapter requires an injected server-side secret accessor and has no default live transport.
- No unapproved knowledge is retrieved. Ingestion always creates drafts, and lifecycle changes need
  a separate trusted administrative action in tests.
- Visitor questions and answers are not persisted as transcripts or profiles. Temporary state holds
  only bounded canonical IDs and clears when the dialogue closes.
- The model cannot author citations, approval state, specialists, destinations, friendly names, or
  directions. Those values are rebuilt from approved server-owned records.
- No analytics, database, public upload endpoint, or automatic content approval exists.
- Real provider traffic remains prohibited until the team separately approves architecture,
  privacy, security, cost, deployment, and rollback decisions.

## I. Remaining work, in priority order

1. Reconcile this handoff with current `main` and preserve the newer three-zone conversation
   validation, Room 116, equipment, and discoverability work.
2. Add a teammate-authored blind evaluation and improve supported paraphrase/multi-property recall
   without weakening zero-false-support behavior.
3. Obtain team approval for any production backend/LLM scope change. Keep the static scripted path as
   the rollback baseline.
4. Design a controlled real OpenAI connection: Worker ownership, approved model, encrypted secret,
   strict schemas, timeouts, no automatic retries, and fixed fictional preflight tests.
5. Add durable abuse/rate limits, provider project limits, usage alerts, a hard budget breaker,
   privacy notice, minimized operational logs, and named incident/rollback owners.
6. Build and review a real Rutgers CORE knowledge corpus through source intake, domain review,
   versioned approval, fixed evaluations, and rollback rehearsal. Never copy synthetic fixture facts.
7. Complete keyboard, pointer-lock, Edge, manual NVDA, and visitor usability testing with backend
   failure and stale-context scenarios.
8. Only after approval, deploy the Worker and verify origin policy, failure isolation, cost controls,
   production scripted fallback, and rollback. Cloudflare deployment is not authorized by this work.

## J. Known GitHub dependencies

- Issue #47 remains open and still requires explicit approval before any live backend/LLM work.
- PR #48 is merged into `main` at merge commit `4a0e10c`. This branch's `src/guide-qa.js` and its
  test are byte-identical to the merged foundation and must not be added a second time.
- PR #59 is merged into `main` at merge commit `44d2813`. Its conversation module adds current
  three-zone/approved-record validation. This branch evolved an older copy and conflicts in
  `src/guide-conversation.js` and `test/guide-conversation.test.js`; preserve both behaviors during
  focused integration.
- PR #61 is open at head `ddc46f9`, targets `main`, has no submitted review or reported CI checks,
  and was cleanly mergeable when verified. This branch's orchestrator and test are byte-identical to
  PR #61, so integration should use the reviewed PR rather than duplicate those additions.
- Current `main` is `44d28139eeaf6260bf2823d007a8c407f9f121e2`. The handoff branch was intentionally not merged or
  rebased with it.

The old-base merge preview also reports a conflict in `src/main.js`, where current production zone
and startup work overlaps the development-only Guide installation. Resolve that integration in a
new focused branch after the foundation PR order is settled; do not rewrite this baseline.

## K. How a teammate can continue

First make sure their own repository has no uncommitted work. Then:

```powershell
Set-Location C:\dev\rutgers-tour
git fetch origin
git switch -c feat/issue-47-next-phase origin/feat/issue-47-local-e2e
npm.cmd install
npm.cmd test
npm.cmd run build
```

The teammate should work on `feat/issue-47-next-phase` or another new branch. They should not modify
`main`, force-push this handoff branch, reset another worktree, or discard unrelated local changes.

For production integration, start a separate focused branch from the latest `origin/main` and bring
over reviewed, non-duplicate pieces deliberately. Keep `origin/feat/issue-47-local-e2e` unchanged as
the recoverable reference.

## L. Reproducible status

- Implementation handoff commit: `cb06b97` (`feat: checkpoint AI CORE Guide generalization (#47)`).
- Branch: `feat/issue-47-local-e2e`.
- Latest main inspected: `44d28139eeaf6260bf2823d007a8c407f9f121e2`.
- Automated tests: 338/338 passed on 2026-10-30.
- Chrome smoke: default success, advanced retrieval/lifecycle, backend-off failure, and production
  isolation all passed on 2026-10-30.
- Production build: passed on 2026-10-30 with the existing large-bundle warning; output JS was
  5,442.95 kB minified / 1,882.76 kB gzip.
- Production isolation: passed; development UI/test hooks were absent and no local Guide request or
  external provider request occurred.
- Unfinished: current-main reconciliation, focused integration, blind evaluation, real CORE content,
  live-backend architecture approval, provider/cost/security controls, NVDA/manual visitor testing,
  deployment, and rollback validation.

See the handoff pull request for the published branch-tip SHA and current review/CI status. No pull
request is authorized to merge without a separate, explicit approval for that specific PR.
