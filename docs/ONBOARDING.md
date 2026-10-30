# DECTA (Interactive Tour) — Team Onboarding Guide

Welcome! This guide takes you from a blank computer to running the project and making your first change. Expect it to take **about half a day**, mostly waiting on installs. Do the steps in order and check them off. If anything fails, don't burn an hour stuck — post in the group chat with a screenshot of the error.

**What we're building:** a web-based, photorealistic 3D tour of the CORE building first floor, made with 3D Gaussian Splatting (phone video → AI-reconstructed 3D scene → explorable in a browser with NPC guides). You do NOT need to understand the 3D reconstruction to contribute — the app, dialogue, and testing work needs no special hardware.

**Current scope (2026-10-30):** exactly CORE Hallway (`hallway`), 3D Printing Room (`printing-room`) and Project Studio / Room 116 (`project-studio`). Machine Shop and Computer Lab are excluded for this team; older capture/research material remains for future groups. Room 116 NPCs are still #56 work, and Vishan's interactive-guide PRs are unmerged (#47).

---

## Part 1 — Install the tools (~45 min)

### 1. Node.js
- [ ] Go to https://nodejs.org and download the **LTS** version. Run the installer, accept all defaults.
- [ ] Verify: open PowerShell (Windows key, type "powershell", Enter) and run `node --version`. You should see a version number.

### 2. Verify npm in PowerShell (Windows)

- [ ] In Windows PowerShell, use `npm.cmd` for npm commands, such as `npm.cmd install` and `npm.cmd run dev`. Some PowerShell configurations block the `npm.ps1` launcher; using `npm.cmd` does not require changing execution policy.
- [ ] Verify: `npm.cmd --version` prints a number. On non-Windows platforms, continue using `npm --version` and the usual `npm` commands.

### 3. VS Code
- [ ] Download from https://code.visualstudio.com and install with defaults. This is your editor — where you'll read code, edit files, and run everything.

### 4. Git
- [ ] Download from https://git-scm.com and install. Git is how we share code. Accept the defaults on every screen EXCEPT these two:
  - **"Choosing the default editor used by Git"** → pick **"Use Visual Studio Code as Git's default editor"** from the dropdown (the installer itself warns you off Vim).
  - **"Adjusting the name of the initial branch"** → pick **"Override the default branch name"** and keep it as **`main`** (matches GitHub's standard).
- [ ] Verify: in a NEW PowerShell window, `git --version` prints a number.

### 5. GitHub account
- [ ] Create a free account at https://github.com (use a username you're OK with professors seeing).
- [ ] Send your username in the group chat so teammates can find you for Issues and Pull Request reviews. Ask a maintainer for collaborator access when you need to push a branch; anyone can clone the public repo.

### 6. An AI coding assistant (pick ONE — your choice)
This repo is set up so any major AI coding tool understands the project: the project brief lives in `AGENTS.md`, a cross-tool standard file that these tools read.
- [ ] Pick and install ONE, based on which AI you already use/prefer:
  - **Claude Code** (Anthropic) — VS Code Extensions panel → search "Claude Code" → install, sign in. Reads project context automatically.
  - **Codex** (OpenAI/ChatGPT) — VS Code Extensions panel → search "Codex" → install, sign in with your ChatGPT account. Reads AGENTS.md automatically.
  - **Gemini CLI / Gemini Code Assist** (Google) — install per Google's current instructions; the repo already contains the settings file that points it at our project context.
- [ ] Whichever you pick, the rules in this guide apply the same way.

---

## Part 2 — Get the project running (~20 min)

### 7. Clone the repo (download the project)
- [ ] Make a folder for code that is NOT inside OneDrive/Dropbox and has NO spaces in the path. Recommended: `C:\dev`
- [ ] In PowerShell:
  ```powershell
  mkdir C:\dev
  cd C:\dev
  git clone https://github.com/JL42R/rutgers-tour.git
  ```
  The repository is public; cloning does not require an invite. If the command fails, check the URL and your network connection.

### 7a. The splat files
**No separate asset download.** The clone contains all three real compressed PLYs:

| File in `public/splats/` | Exact bytes |
|---|---:|
| `hallway.compressed.ply` | 19,617,110 |
| `printing-room-updated.compressed.ply` | 62,132,080 |
| `project-studio.compressed.ply` | 68,849,656 |

These are the three active environments; skip to step 8. No WSL, CUDA or training setup is needed to run them.

What stays out of Git, and why: raw uncompressed PLY exports are ~240 MB each, over GitHub's
100 MB hard limit, so `.gitignore` excludes `*.ply` and re-includes only the finished
`public/splats/*.compressed.ply` files. Raw capture video is excluded for the same reason. A new
zone named `<zone>.compressed.ply` is therefore tracked automatically. This is retained pipeline guidance for existing-data research/future cohorts; the current team is not adding zones. See `.claude/skills/training-pipeline/SKILL.md` only for separately authorized pipeline work.

**Drive folders — only if you're doing capture or training work:**
- Raw capture videos (phone footage, before COLMAP/training): https://drive.google.com/drive/folders/1ux-tWNdUBWBhVojNKb_qSXBVEBpQkwyW?usp=drive_link
  Upload every take here per `.claude/skills/capture-protocol/SKILL.md`. This footage is the
  only irreplaceable asset in the project — a splat can be retrained, a capture session can't
  be re-shot under the same light.
- Raw and intermediate splat exports (archive, not needed to run the app): https://drive.google.com/drive/u/0/folders/1CH1AtdKyM76MwLCx59VzMFqnssYlIFHT

### 8. Open and run it
- [ ] VS Code → **File → Open Folder** → `C:\dev\rutgers-tour`. Click "Yes, I trust the authors."
- [ ] Open the built-in terminal: **View → Terminal**.
- [ ] Run:
  ```powershell
  npm.cmd install
  npm.cmd run dev
  ```
- [ ] Ctrl+click the Local URL Vite prints (usually `http://localhost:5173`; use the actual port). `npm.cmd` avoids a blocked PowerShell `npm.ps1` launcher; other platforms can use `npm`.
- [ ] **Success check:** the hallway scan loads, with an automatic welcome and Tour Progress. Close dialogue, click the scene, walk with WASD and look with the mouse; Esc releases the mouse. Walk through D1 on the hallway's negative-X wall to the printing room's **five NPCs**; approach a marker and press E. Return to the hallway and continue toward positive Z to D3 on the positive-X wall near the far end for Room 116. Return through the same door. Room 116's navigation is implemented but **it has no NPCs yet**. A gray placeholder is not the normal production experience.
- [ ] To stop the server later: click in the terminal, press **Ctrl+C**. To run other commands while it's running, open a second terminal with the **+** button.

### 8a. Production deployment (GitHub Pages)
The current static host is **GitHub Pages**. The public tour is available at
https://jl42r.github.io/rutgers-tour/.

Deployment is automated by `.github/workflows/deploy.yml`. Every push or merged pull request to
`main` runs `npm ci`, builds the production site with `npm run build`, and publishes the generated
`dist/` directory. In the repository settings, **Settings → Pages → Source** must remain set to
**GitHub Actions**; the workflow cannot publish through the older branch-based Pages setting.

After a deployment:
1. Open the repository's **Actions** tab and confirm **Deploy to GitHub Pages** passed.
2. Open the public URL in a private browser window. Record time to usable hallway, then per-zone and full-route loading through D1 → printing room → hallway → D3 → Room 116 → hallway. Record browser/version, hardware, network and cache conditions; a prior printing-room timing is not the current three-zone result.
3. Confirm WASD, mouse-look, pointer lock/Esc release, collision, and sliding along room boundaries.
4. Confirm the cyan collision debug overlay is hidden and no gray placeholder room appears.
5. If loading fails, use the browser Network tab to check that `zones.json` and the configured
   `.compressed.ply` request both return HTTP 200.

Issue #11 established a deployment baseline on 2026-09-22: the tour became usable in approximately
**12 seconds on a non-Johnny Windows machine over normal Wi-Fi**, with the real printing-room splat,
movement, mouse-look, pointer lock, collision, and boundary sliding all working. Deployment test
coverage exists for **Chrome and Edge**. **Firefox remains unverified. Safari remains unverified and
requires a teammate with a macOS or iOS device.** These are historical printing-room deployment checks. Later Room 116 publication at `b2a18e5` passed [Pages run 40986520793](https://github.com/JL42R/rutgers-tour/actions/runs/40986520793), and the user reported 14/14 integrated Chrome checks after the earlier 41/41 stage checks. Current three-zone cold-cache timing and remaining browser acceptance still need measurements (#11).

### 8b. Regression checks and current limitations

From the repository root:

```powershell
node --test tests/room116-boundary.test.js tests/room116-exclusions.test.js tests/room116-entry.test.js
npm.cmd run build
```

There are 55 tracked Room 116 tests. CI currently runs install/build but not this suite (#68). Historical local equipment/integration probes under ignored `tmp/` are not fresh-clone requirements. The runtime includes `src/interaction-tracker.js`, `src/room116-*.js` and opt-in `src/equipment-*.js` helpers in addition to the core modules listed in README.

Known open work: studio NPCs (#56); interactive-guide integration (#47 — the current Johnny form only echoes AI TEST); missing Vishan portrait/marker image (#67); permanent printing equipment boxes (#66); actual NVDA announcement failure (#33); and visual-quality/SH/load/FPS comparisons (#8/#23/#24/#25/#34). Do not mistake successful tests/builds for those acceptance results.

---

## Part 3 — Learn the project (~1–2 hours, can split across days)

### 9. Read, in this order
Why several docs? Each has one job: `README.md` = front door for humans (GitHub shows it on the repo page), `DESIGN.md` = technical decisions and the reasoning behind them, `docs/ONBOARDING.md` = this one-time setup guide, `AGENTS.md` = the same orientation written for AI coding tools, which read it automatically (humans rarely open it).
- [ ] `README.md` — 5 minutes, the map of the repo.
- [ ] `DESIGN.md` — the project bible. Every technical decision is already made and explained here. **Do not relitigate locked decisions** — if you think one is wrong, raise it at the weekly sync.
- [ ] `docs/PLAN.md` — roles and schedule (you have one!).

### 10. Meet your AI assistant
- [ ] Open your assistant's panel in VS Code with the project folder open.
- [ ] Ask it: **"Read AGENTS.md and tell me what this project is and how I should work in this repo."** If it answers with project specifics (Gaussian splats, zones, NPCs, our locked decisions), it's connected. If it doesn't know what you're talking about, ask it to read the file `AGENTS.md` in the project root explicitly.
- [ ] If you chose Claude Code: take Anthropic's free **Claude Code 101** course (search for it — one evening, worth it). Other tools have similar getting-started guides.
- [ ] Habits that matter with ANY tool: describe tasks specifically ("add X to the dialogue box") not vaguely ("make it better") · review every change it makes before accepting · commit working code BEFORE asking for big changes · if it goes in circles twice, start a fresh session with a better prompt instead of arguing with it.

### 11. Make your first change (proves the whole loop works)
- [ ] With `npm run dev` running, open `index.html` and change a word in the visible top-left hint (for example, "Click to explore."). Save and watch the browser update.
- [ ] Revert it (Ctrl+Z, save) or keep it if it's an improvement.

### 12. Your first real task
- [ ] Go to the repo's **Issues** tab on GitHub and claim an issue matching your role (comment "I'll take this").
- [ ] Workflow: create a branch → make the change (Claude Code helps) → commit → push → open a Pull Request → one teammate reviews → merge. If those words mean nothing yet, ask your AI assistant: *"walk me through making a branch and a pull request for this change."*

---

## Team rules
1. `main` always runs. Never commit directly to it — branches + PRs only.
2. Small PRs beat big ones. One issue, one PR.
3. After every work session, update your GitHub Issue and add a `CHANGELOG.md` entry. Those two are the project's memory — Markdown checklists go stale and nobody trusts them.
4. Stuck for more than ~30 minutes? Ask the group chat. Struggling silently helps nobody.
5. Weekly 30-min sync: demo what works, update the plan.

## Who does what (from docs/PLAN.md)
Tasks are unassigned by design — see `docs/PLAN.md` §1. Pick up whatever's open on the GitHub
milestone board, say so in the team chat before you start, and speak up within 48 hours if you
stall.

The one hard constraint is hardware: **Johnny's laptop is the only machine with a GPU capable of
training**, so every training task lands there by necessity. Nobody else needs WSL2/Nerfstudio/CUDA
— skip anything about those. Everything else — capture, dialogue writing, collision authoring,
testing, deployment — is open to whoever has time.

## Troubleshooting quick hits
- `npm` "cannot be loaded / running scripts is disabled" → PowerShell may be blocking `npm.ps1`. Use `npm.cmd install` or `npm.cmd run dev` as shown in step 2; no execution-policy change is required.
- `npm install` fails or acts weird → check the terminal prompt ends in `rutgers-tour` (you must be IN the project folder), and confirm the folder is not inside OneDrive.
- Gray placeholder instead of a real scan → check the configured filename and the three asset sizes in §7a, then inspect the failing request/console. Hallway loads first, so check `hallway.compressed.ply` first. Preserve local work before considering a fresh clone.
- Console shows `Splat failed for zone ... using placeholder` → the file is missing from `public/splats/`, or the filename in `public/zones.json` doesn't match it.
- Blank page in the browser → press F12, open the Console tab, copy the red error, paste it to your AI assistant and ask it to fix it.
- Anything else → ask your AI assistant first, then the group chat. Always paste the exact error text, never a description of it.

## Glossary (30 seconds)
- **Gaussian splat**: the photorealistic 3D scan format we use. Lives in `public/splats/`.
- **Zone**: one captured area (lobby, hallway…). Defined in `public/zones.json`.
- **NPC**: a tour guide character. Its script is a JSON file in `public/dialogue/` — editing it requires zero code.
- **Placeholder room**: the gray grid room shown when a zone's configured scan is unavailable.
- **Vite / npm run dev**: the tool that serves the app locally and auto-refreshes your browser on save.

---

**Setup complete!** From here on, `README.md` is your day-to-day reference, `DESIGN.md` is where technical decisions live, and GitHub Issues is where work gets claimed. Welcome aboard — see you at the weekly sync.
