# DECTA (Interactive Tour) — Team Onboarding Guide

Welcome! This guide takes you from a blank computer to running the project and making your first change. Expect it to take **about half a day**, mostly waiting on installs. Do the steps in order and check them off. If anything fails, don't burn an hour stuck — post in the group chat with a screenshot of the error.

**What we're building:** a web-based, photorealistic 3D tour of the CORE building first floor, made with 3D Gaussian Splatting (phone video → AI-reconstructed 3D scene → explorable in a browser with NPC guides). You do NOT need to understand the 3D reconstruction to contribute — the app, dialogue, and testing work needs no special hardware.

---

## Part 1 — Install the tools (~45 min)

### 1. Node.js
- [ ] Go to https://nodejs.org and download the **LTS** version. Run the installer, accept all defaults.
- [ ] Verify: open PowerShell (Windows key, type "powershell", Enter) and run `node --version`. You should see a version number.

### 2. Fix PowerShell script permissions (Windows only — you WILL hit this otherwise)
- [ ] In PowerShell, run:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
  Type `Y` if it asks. (Windows blocks npm by default; this is the standard safe fix.)
- [ ] Verify: `npm --version` prints a number.

### 3. VS Code
- [ ] Download from https://code.visualstudio.com and install with defaults. This is your editor — where you'll read code, edit files, and run everything.

### 4. Git
- [ ] Download from https://git-scm.com and install. Git is how we share code. Accept the defaults on every screen EXCEPT these two:
  - **"Choosing the default editor used by Git"** → pick **"Use Visual Studio Code as Git's default editor"** from the dropdown (the installer itself warns you off Vim).
  - **"Adjusting the name of the initial branch"** → pick **"Override the default branch name"** and keep it as **`main`** (matches GitHub's standard).
- [ ] Verify: in a NEW PowerShell window, `git --version` prints a number.

### 5. GitHub account
- [ ] Create a free account at https://github.com (use a username you're OK with professors seeing).
- [ ] Send your username in the group chat so you can be added to the private repo.
- [ ] Wait for the invite email, accept it.

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
  (If that URL fails, you haven't accepted the repo invite yet — see step 5.)

### 7a. Download the current splat (not in the repo)
Splat files are **not** in git, on purpose. GitHub blocks any push containing a file
over 100 MB, and our current printing-room export is 240 MB, so `*.ply` and `*.mp4`
stay in `.gitignore` permanently — this is deliberate, not an oversight. Do not remove
those `.gitignore` rules or try to commit a splat file yourself.

- [ ] Open the shared Drive folder: https://drive.google.com/drive/u/0/folders/1CH1AtdKyM76MwLCx59VzMFqnssYlIFHT
- [ ] Download the current zone's splat file and place it in `public/splats/`
- [ ] Open `public/zones.json` and check the zone's `"splat"` field names the exact
  filename you just downloaded (e.g. `"./splats/printing-room-updated.ply"`) — if the
  filename doesn't match, the app can't find the file

### 8. Open and run it
- [ ] VS Code → **File → Open Folder** → `C:\dev\rutgers-tour`. Click "Yes, I trust the authors."
- [ ] Open the built-in terminal: **View → Terminal**.
- [ ] Run:
  ```powershell
  npm install
  npm run dev
  ```
- [ ] Ctrl+click the `http://localhost:5173` link that appears.
- [ ] **Success check:** you see a 3D room. Click it, walk with WASD, look with the mouse, walk to the floating scarlet badge and press **E** to talk to the demo NPC. Esc releases your mouse. If all that works, your setup is done.
- [ ] To stop the server later: click in the terminal, press **Ctrl+C**. To run other commands while it's running, open a second terminal with the **+** button.

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
- [ ] With `npm run dev` running, open `public/dialogue/demo-guide.json` and change one of Riley's lines. Save. Watch the browser update. Talk to Riley — your words.
- [ ] Revert it (Ctrl+Z, save) or keep it if it's an improvement.

### 12. Your first real task
- [ ] Go to the repo's **Issues** tab on GitHub and claim an issue matching your role (comment "I'll take this").
- [ ] Workflow: create a branch → make the change (Claude Code helps) → commit → push → open a Pull Request → one teammate reviews → merge. If those words mean nothing yet, ask your AI assistant: *"walk me through making a branch and a pull request for this change."*

---

## Team rules
1. `main` always runs. Never commit directly to it — branches + PRs only.
2. Small PRs beat big ones. One issue, one PR.
3. After every work session, update the status checklist at the bottom of `AGENTS.md` (so humans AND AI sessions know where things stand).
4. Stuck for more than ~30 minutes? Ask the group chat. Struggling silently helps nobody.
5. Weekly 30-min sync: demo what works, update the plan.

## Who does what (from docs/PLAN.md)
Tasks are unassigned by design — see `docs/PLAN.md` §1. Pick up whatever's open in the current
week's list, say so in the team chat before you start, and speak up within 48 hours if you stall.

The one hard constraint is hardware: **Johnny's laptop is the only machine with a GPU capable of
training**, so every training task lands there by necessity. Nobody else needs WSL2/Nerfstudio/CUDA
— skip anything about those. Everything else — capture, dialogue writing, collision authoring,
testing, deployment — is open to whoever has time.

## Troubleshooting quick hits
- `npm` "cannot be loaded / running scripts is disabled" → you skipped step 2 (execution policy).
- `npm install` fails or acts weird → check the terminal prompt ends in `rutgers-tour` (you must be IN the project folder), and confirm the folder is not inside OneDrive.
- Gray placeholder room instead of the real splat → expected until you've downloaded the splat file (see step 7a).
- Console shows `Splat failed for zone ... using placeholder` → the file is missing from `public/splats/`, or the filename in `public/zones.json` doesn't match what you downloaded.
- Blank page in the browser → press F12, open the Console tab, copy the red error, paste it to your AI assistant and ask it to fix it.
- Anything else → ask your AI assistant first, then the group chat. Always paste the exact error text, never a description of it.

## Glossary (30 seconds)
- **Gaussian splat**: the photorealistic 3D scan format we use. Lives in `public/splats/`.
- **Zone**: one captured area (lobby, hallway…). Defined in `public/zones.json`.
- **NPC**: a tour guide character. Its script is a JSON file in `public/dialogue/` — editing it requires zero code.
- **Placeholder room**: the gray grid room you see before a zone has a real scan.
- **Vite / npm run dev**: the tool that serves the app locally and auto-refreshes your browser on save.

---

**Setup complete!** From here on, `README.md` is your day-to-day reference, `DESIGN.md` is where technical decisions live, and GitHub Issues is where work gets claimed. Welcome aboard — see you at the weekly sync.
