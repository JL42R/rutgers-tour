# Training environment setup (WSL2 + Nerfstudio + splatfacto)

**Audience:** Johnny only. This is the single GPU-capable machine on the team; teammates skip
this document entirely. Their setup is `docs/ONBOARDING.md`.

**Purpose:** stand up the splat training pipeline and pass Gate G1 (pipeline validation).
G1 target: **September 11, 2026**. See `PLAN.md` for what happens if we miss it.

**Hardware:** RTX 5060 Laptop, 8 GB VRAM, 16 GB DDR5. Windows host.

---

### Verified environment (observed September 3–7, 2026)

Steps 1 through 9a confirmed complete and verified September 7, 2026.

| Component | Observed |
|---|---|
| `nvidia-smi` | NVIDIA-SMI 610.43.02, CUDA UMD 13.3, RTX 5060 Laptop, 8151 MiB VRAM visible from inside WSL2 |
| `nvcc --version` | release 12.8, V12.8.93 |
| `colmap -h` | COLMAP 3.9.1 -- (Commit Unknown on Unknown without CUDA) |
| `ffmpeg -version` | 6.1.1 |
| Python (venv) | 3.11.15 |

gsplat 1.4.0 JIT-compiles its CUDA kernels on first GPU use rather than shipping prebuilt
binaries, so the first training run incurs a one-time `nvcc` compile. That compile was killed
with `Terminated` at `MAX_JOBS=4`. Root cause: WSL2 allocates roughly half of host RAM by
default, giving Linux about 8 GB of the machine's 16 GB — not the 8 GB VRAM ceiling, a separate
constraint. Fixed by setting `MAX_JOBS=2` and raising the WSL2 allocation to 12 GB with 4 GB
swap via a `.wslconfig` file in the Windows user profile (see section 4b). Both settings are now
persisted — `MAX_JOBS` in `~/.bashrc`, memory in `.wslconfig`.

**sm_120 kernel execution CONFIRMED:** 2000 iterations of splatfacto ran at ~15 ms/iteration and
34–39 M rays/sec. A CPU fallback would be orders of magnitude slower, so this rules out the
silent-fallback failure mode described in section 0.

Nerfstudio auto-selected an image downscale factor of 4 on 4K input without being asked. Export
produced a 30 MB `splat.ply` from 57 registered frames.

---

## 0. Read this before typing anything

**The official Nerfstudio installation page will not work on this machine.** Do not follow it.

The RTX 5060 is a Blackwell GPU with CUDA compute capability **sm_120**. The Nerfstudio docs
specify `torch==2.1.2+cu118` with a CUDA 11.8 toolkit. That PyTorch build contains no compiled
kernels for sm_120. The observable symptom is a warning that sm_120 is not compatible with the
current PyTorch install, listing supported capabilities only up to sm_90, followed by either a
silent fall back to CPU (training "works" but takes days) or a hard
`no kernel image is available for execution on the device`.

The silent CPU fallback is the dangerous one. **Every step below has a verification command.
Run it. Do not proceed past a failed check.**

### Three decisions this document encodes

| Decision | Reasoning |
|---|---|
| **Skip tiny-cuda-nn entirely** | It is required for `nerfacto`, not `splatfacto`. We locked splatfacto in July, so we never need it. It is also the single most failure-prone package in the Nerfstudio stack on new hardware. Removing it removes most of the reported pain. |
| **CUDA 12.8+ toolkit and a cu128 PyTorch wheel** | compute_120 did not exist before CUDA 12.8. An older `nvcc` rejects `compute_120` outright. |
| **WSL2 Ubuntu 24.04, not native Windows** | Reports from RTX 50-series users describe native Windows producing repeated CUDA/driver/MSVC/PyTorch mismatches, with Ubuntu being cleaner and more reproducible. Native Windows also drags in Visual Studio build tools as another failure surface. |

### Honest uncertainty

Nothing left here — the last open item (splatfacto's VRAM-tuning flag names) was resolved
September 4, 2026 by reading the config splatfacto prints at startup, not guessed or copied
from old forum posts:

- **Image cache location:** `cache_images`, CLI form `--pipeline.datamanager.cache-images cpu`
  (default is `gpu`).
- **Downscale:** `num_downscales` (default 2), and the dataparser's `downscale_factor`.
- **Gaussian count levers:** `stop_split_at` (default 15000), `cull_alpha_thresh`,
  `densify_grad_thresh`.

These were read off `ns-train`'s own config dump on the Nerfstudio version actually installed —
that dump, not old posts or `--help` text alone, is the reliable way to find current flag names
if they drift again on a future install.

Everything else is either a standard command or verified against reports from Blackwell users.

### Budget

Set aside **30+ GB of free disk** and expect **4–8 hours of wall time**, much of it waiting on
downloads and compilation. This is a two-sitting job, not an evening. Do not start it the night
before G1.

---

## 1. Windows-side pre-flight

Run in **Windows PowerShell** (not WSL):

```powershell
nvidia-smi
```

Read the top-right corner. You need the reported **CUDA Version to be 12.8 or higher**. That
number reflects your *driver's* capability, not an installed toolkit.

- If it reads 12.8+ → continue.
- If it reads lower → update your NVIDIA driver from GeForce Experience or nvidia.com first.
  Nothing below will work until this is satisfied.

Also confirm free space on `C:` (or wherever WSL will live) is above 30 GB.

---

## 2. Install WSL2 with Ubuntu 24.04

Admin PowerShell:

```powershell
wsl --install -d Ubuntu-24.04
```

Reboot when prompted. On first launch it asks for a UNIX username and password — these are
local to WSL and unrelated to your Windows or GitHub accounts. Write the password down; you
need it for every `sudo`.

**Verify:**

```powershell
wsl -l -v
```

The `VERSION` column must read `2`. If it reads `1`, run
`wsl --set-version Ubuntu-24.04 2` and re-check. WSL1 has no GPU passthrough; the rest of this
document is impossible on WSL1.

---

## 3. Verify GPU passthrough

Open the Ubuntu terminal. Run:

```bash
nvidia-smi
```

You should see **NVIDIA GeForce RTX 5060** and the same CUDA version PowerShell reported.

> **Do not install an NVIDIA driver inside WSL.** The Windows driver provides the GPU through
> the passthrough layer. Installing a Linux driver inside WSL breaks it.

If `nvidia-smi` is not found or shows no GPU, stop and fix passthrough. Continuing past this
point wastes hours.

---

## 4. Install the CUDA 12.8 toolkit (NVIDIA's WSL repo)

> **Do not run `sudo apt install nvidia-cuda-toolkit`.** Ubuntu 24.04's default repo package
> installs CUDA 12.0, which predates Blackwell. Its `nvcc` will reject `compute_120` with
> `Unsupported gpu architecture 'compute_120'`. This is a documented trap.

Use NVIDIA's WSL-specific repo. Verify the current filenames on NVIDIA's page first, then:

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
```

Before committing to the multi-GB `cuda-toolkit-12-8` download, confirm the versioned 12.8
package is still being served. NVIDIA's network repo now serves CUDA 13.x as current, so this
is not a formality:

```bash
apt-cache policy cuda-toolkit-12-8
```

Observed September 3, 2026: `Candidate: 12.8.2-1`, with `12.8.1-1` and `12.8.0-1` also
available, at apt priority 600. If `Candidate` instead reads `(none)`, the 12.8 package has
been pruned from the repo — evaluate the local-installer route or a move to CUDA 13 before
proceeding, rather than continuing on this document as written.

```bash
sudo apt-get -y install cuda-toolkit-12-8
```

Add CUDA to your shell permanently:

```bash
echo 'export CUDA_HOME=/usr/local/cuda-12.8' >> ~/.bashrc
echo 'export PATH=$CUDA_HOME/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

**Verify:**

```bash
nvcc --version
```

Must report release **12.8** (or higher). If it reports 12.0, the apt package won and you need
to remove `nvidia-cuda-toolkit` before continuing.

---

## 4b. WSL2 memory allocation

WSL2 defaults to allocating roughly **half of the host's RAM** to Linux — on this 16 GB
machine, that's about 8 GB. This is separate from, and unrelated to, the 8 GB VRAM ceiling
discussed elsewhere in this document: it's system RAM, and it's the binding constraint on
`nvcc` compilation (step 8's gsplat build, and gsplat's first-use JIT compile in step 9), not
on training itself.

Create (or edit) `.wslconfig` in your Windows user profile. **Creating this file via Notepad
can silently produce the wrong filename** (`.wslconfig.txt`) because Windows hides known
extensions by default — use PowerShell instead:

```powershell
Set-Content -Path "$env:USERPROFILE\.wslconfig" -Value @("[wsl2]","memory=12GB","swap=4GB")
```

Apply it by shutting down WSL2 completely (it restarts automatically on next use):

```powershell
wsl --shutdown
```

**Verify**, inside Ubuntu:

```bash
free -h
```

`Mem:` total should now read close to 12 GB.

---

## 5. System dependencies

```bash
sudo apt-get update
sudo apt-get install -y build-essential git cmake ninja-build ffmpeg colmap
```

**Verify:**

```bash
colmap -h | head -n 3
ffmpeg -version | head -n 1
```

Note: the apt COLMAP build lacks CUDA feature matching — confirmed September 3, 2026, where
`colmap -h` reported `COLMAP 3.9.1 -- (Commit Unknown on Unknown without CUDA)`. It is fine for
validating the pipeline. If alignment quality is a problem on real CORE data, that is a G2
concern, not a G1 blocker — and building COLMAP from source with CUDA is the escalation, not a
rewrite.

---

## 6. Python environment

Use a clean venv on Python 3.11. Nerfstudio's docs suggest Python 3.8; the cu128 PyTorch
wheels we need are not published for 3.8, so 3.8 is not an option here.

Ubuntu 24.04 (noble) does not carry `python3.11` in its default repositories — confirmed
September 3, 2026, where the plain `apt-get install` below failed with
`E: Unable to locate package python3.11`. Python 3.11 has to come from the deadsnakes PPA:

```bash
sudo apt-get install -y software-properties-common
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
```

deadsnakes is a third-party Launchpad PPA, not official Canonical software. Installing from it
adds Python 3.11 **alongside** Ubuntu's system 3.12 rather than replacing it, so `python3` /
`python3.12` remain untouched.

```bash
python3.11 -m venv ~/nerf
echo 'alias nerf="source ~/nerf/bin/activate"' >> ~/.bashrc
source ~/.bashrc
nerf
python -m pip install --upgrade pip setuptools wheel
```

**Verify:**

```bash
~/nerf/bin/python --version
```

Must report **3.11.x**. Observed September 3, 2026: `Python 3.11.15`.

From here on, **every command assumes the venv is active.** If your prompt does not show
`(nerf)`, run `nerf` first. Forgetting this is the most common way to spend an hour confused.

---

## 7. PyTorch with sm_120 support

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
```

**Verify — this is the most important check in the document:**

```bash
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0)); print(torch.cuda.get_device_capability(0))"
```

Required output shape:

```
2.x.x+cu128
True
NVIDIA GeForce RTX 5060 Laptop GPU
(12, 0)
```

**`(12, 0)` is the number that matters.** It means PyTorch recognizes sm_120. If you see
`False`, a different capability, or a warning about sm_120 incompatibility, stop here. Nothing
downstream can compensate for this and every later error will be a confusing symptom of it.

If the stable cu128 wheel does not expose `(12, 0)`, fall back to the nightly channel:

```bash
pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128
```

Then re-run the verification. Note in `PLAN.md` if you ended up on nightly — it is a
reproducibility risk worth recording for the report.

---

## 8. Nerfstudio and gsplat

Order matters. Installing Nerfstudio can pull in its own PyTorch and silently overwrite the
working one.

```bash
pip install nerfstudio
```

**Immediately re-verify PyTorch was not replaced:**

```bash
python -c "import torch; print(torch.__version__, torch.cuda.get_device_capability(0))"
```

If the version no longer ends in `+cu128`, or capability is not `(12, 0)`, reinstall torch from
step 7 — pip will keep the rest of Nerfstudio intact.

Now build gsplat for the right architecture. gsplat compiles its CUDA kernels on first use, and
there are reports of it defaulting to `compute_90` only, which produces a GPU that appears
present but cannot execute. Force the target explicitly:

```bash
export TORCH_CUDA_ARCH_LIST="12.0"
export MAX_JOBS=2
pip install --no-build-isolation gsplat
```

`MAX_JOBS=2` is the verified cap for parallel compilation on this machine: `MAX_JOBS=4`
caused the gsplat CUDA compile to be killed, while 2 succeeded with the 12 GB WSL2 memory
allocation and 4 GB swap from section 4b. This setting is also persisted in `~/.bashrc`
for gsplat's first-use JIT compile.

Persist the arch flag so future rebuilds don't regress:

```bash
echo 'export TORCH_CUDA_ARCH_LIST="12.0"' >> ~/.bashrc
```

**Verify:**

```bash
python -c "import gsplat; print(gsplat.__version__)"
ns-train --help | head -n 5
```

---

## 9. G1 smoke test

Two runs. The first proves the toolchain; the second proves it survives our data.

### 9a. Known-good public dataset (diagnostic, not a prerequisite)

This step exists to isolate toolchain failures from capture failures — if known-good data
trains cleanly, the problem is your capture, not the install. It produces nothing used
downstream and can be skipped if unavailable.

```bash
cd ~ && mkdir -p work && cd work
ns-download-data nerfstudio --capture-name=poster
ns-train splatfacto --data data/nerfstudio/poster --max-num-iterations 2000
```

**The `poster` download is broken as of September 4, 2026.**
`ns-download-data nerfstudio --capture-name=poster` fails with a `gdown` `FileURLRetrievalError`
— the Google Drive file is gone, not rate-limited (confirmed by opening the link directly in a
browser). A direct `wget` from `data.nerf.studio` also 404s. This is a long-standing upstream
Nerfstudio issue with multiple open reports, not something to debug locally. Other
`--capture-name` values point at different Drive IDs and may still work — worth a quick try —
but don't burn G1 time chasing this. If no known-good dataset is reachable, skip 9a and go
straight to 9b; its value is as a fallback to reach for later, when a real capture fails
confusingly and you need to know whether the toolchain or the footage is at fault.

While it runs, open a second Ubuntu terminal and watch:

```bash
watch -n 2 nvidia-smi
```

**Pass criteria — all four:**

1. No sm_120 incompatibility warning anywhere in the output.
2. `nvidia-smi` shows non-trivial VRAM allocated to the python process. If VRAM is near zero
   and CPU is pinned, you are on the CPU fallback path — that is a failure even though it looks
   like progress.
3. 2000 iterations complete in minutes, not hours.
4. Export produces a file:

```bash
ns-export gaussian-splat --load-config outputs/.../config.yml --output-dir exports/poster
```

### 9b. Your own capture (the real test)

Shoot a short video of a hallway in your apartment — smooth, slow, heavily overlapping, no
motion blur. See `.claude/skills/capture-protocol/SKILL.md` for the protocol; this is also a
rehearsal for CORE, so follow it properly rather than casually.

```bash
ns-process-data video --data ~/work/hallway.mp4 --output-dir ~/work/hallway-proc
ns-train splatfacto --data ~/work/hallway-proc
```

**COLMAP time budget:** observed ~24 minutes wall time for 309 frames on the apt-installed
CPU-only COLMAP (24m6s real, 146m43s user — roughly 6-way parallelism across cores). A CUDA
COLMAP build would accelerate feature extraction and matching but not the mapping /
bundle-adjustment stage, so expect roughly 2–4x, not an order of magnitude — this estimate is
unmeasured. Weigh that against the planned zone count before deciding whether building COLMAP
from source with CUDA (see step 5) is worth the time.

`ns-process-data` also supports `--matching-method`. Sequential matching is better suited to
video than the default (exhaustive), since frames adjacent in time are the ones that actually
overlap.

**8 GB VRAM is the binding constraint here.** If training dies with an out-of-memory error, the
three levers, in order of preference:

1. Downscale input images (`ns-process-data` and `ns-train` both expose a downscale factor)
2. Move the image cache off the GPU to CPU RAM
3. Cap the maximum gaussian count

Get the exact current flag names from `ns-train splatfacto --help`. Do not guess and do not
copy flags from old forum posts — they have changed between releases.

### 9c. Close the loop

The pipeline is not validated until a splat renders in *our* app:

```bash
ns-export gaussian-splat --load-config outputs/.../config.yml --output-dir exports/hallway
cp exports/hallway/splat.ply /mnt/c/dev/rutgers-tour/tmp/
```

Then clean it in SuperSplat while preserving reconstruction coordinates, test Compressed PLY,
drop it into the zone loader, and walk around it in the browser with WASD. SuperSplat SPZ v4
is incompatible with the current Spark release; see `DESIGN.md`.

**G1 passes when you have walked through your own hallway in our own app.** Not when
`ns-train` finishes.

If `ns-export` or `ns-viewer` fails with `_pickle.UnpicklingError: Weights only load failed`,
see 9d below before trying anything else.

### 9d. Patch the checkpoint loader (required before export)

PyTorch 2.6 flipped `torch.load`'s default `weights_only` from `False` to `True`. `torch.load`
deserializes Python pickles, which can execute arbitrary code, so this tightened default is a
real security improvement — for checkpoints from untrusted sources. Overriding it back to
`False` is safe **specifically here** because the checkpoint was produced by our own training
run on this machine, not downloaded from anywhere.

Nerfstudio's `eval_utils.py` calls `torch.load` without setting `weights_only`, and its
checkpoints contain a `numpy.core.multiarray.scalar` object that isn't on PyTorch's default
allowlist, so both `ns-export` and `ns-viewer` fail on it. Patch it, with the venv active:

```bash
cp ~/nerf/lib/python3.11/site-packages/nerfstudio/utils/eval_utils.py ~/nerf/lib/python3.11/site-packages/nerfstudio/utils/eval_utils.py.bak

sed -i 's/loaded_state = torch.load(load_path, map_location="cpu")/loaded_state = torch.load(load_path, map_location="cpu", weights_only=False)/' ~/nerf/lib/python3.11/site-packages/nerfstudio/utils/eval_utils.py

grep -n "loaded_state = torch.load" ~/nerf/lib/python3.11/site-packages/nerfstudio/utils/eval_utils.py
```

**Verify:** the grep must show `weights_only=False` on the matched line.

**Reproducibility warning:** this patch modifies a file inside the venv at
`~/nerf/lib/python3.11/site-packages/`, which is **not** in version control. It will be lost if
the venv is recreated, if Nerfstudio is reinstalled or upgraded, or on a fresh machine. Anyone
rebuilding this environment must reapply it by hand. This is a known fragility in the current
setup — if the environment is ever rebuilt, scripting this patch or vendoring a patch file into
the repo is worth doing.

---

## 10. Failure modes, ranked by likelihood

| Symptom | Cause | Action |
|---|---|---|
| sm_120 not compatible with current PyTorch | cu118 or pre-cu128 wheel installed | Redo step 7; check nothing re-installed torch after |
| `no kernel image is available for execution on the device` | Extension compiled without compute_120 | Rebuild gsplat with `TORCH_CUDA_ARCH_LIST="12.0"` set |
| `nvcc fatal: Unsupported gpu architecture 'compute_120'` | Ubuntu's CUDA 12.0 apt package is on PATH | Remove `nvidia-cuda-toolkit`, redo step 4, confirm `nvcc --version` |
| `nvidia-smi` empty inside WSL | WSL1, or a Linux driver was installed inside WSL | Force WSL2; never install a driver in WSL |
| Training runs but VRAM near zero, CPU pinned | Silent CPU fallback | Treat as failure; return to step 7 verification |
| gsplat build killed with no clear error | Parallel nvcc exhausted 16 GB RAM | Lower `MAX_JOBS` to 2 and retry |
| CUDA OOM during training | 8 GB ceiling | Downscale images, CPU image cache, cap gaussians |
| `ns-export` or `ns-viewer` fails with `_pickle.UnpicklingError: Weights only load failed` | PyTorch 2.6 changed the default of `torch.load`'s `weights_only` argument from `False` to `True`. Nerfstudio's `eval_utils.py` calls `torch.load` without specifying it, and its checkpoints contain `numpy.core.multiarray.scalar`, which is not on PyTorch's default allowlist. | **BLOCKS EXPORT** — patch immediately, see section 9d. Not low priority. |
| Very slow file I/O | Working out of `/mnt/c/...` | Keep datasets in the WSL filesystem (`~/work`); only copy finished exports to `/mnt/c` |
| COLMAP finds poses for almost no frames (<1%) | HDR video extracted to 8-bit frames without tonemapping destroys local contrast, so the feature detector has nothing to match | Verify with `ffprobe` for HDR/DOVI metadata, reshoot with HDR off — see `.claude/skills/capture-protocol/SKILL.md` |
| COLMAP registers a contiguous block of frames only | Motion blur breaking the match chain partway through the walk | This is a capture failure, not a training or parameter problem — recapture, don't retrain |

---

## 11. If G1 fails on September 11

Per `PLAN.md`, the gate has a fallback rather than an extension. Evaluate in this order:

1. **Brush** — a Rust/WGPU 3DGS trainer. It sidesteps the CUDA stack entirely, which is
   attractive precisely because CUDA-on-Blackwell is the thing that failed. Least investigated
   of the three; worth an hour of evaluation before committing.
2. **Postshot Indie** — native Windows, no WSL, no CUDA toolchain management.
3. **Luma AI / Polycam cloud** — zero local pipeline control, but a zone processed in the cloud
   is still a valid zone.

Losing local training control is acceptable for a prototype. Losing October capture weather is
not. Do not let the install eat the capture window — that tradeoff is already decided, and the
gate exists to enforce it.

---

## 12. Repo hygiene

Confirm `.gitignore` covers, before any splat file exists on disk:

```
*.ply
data/
outputs/
exports/
tmp/
*.mp4
```

Raw captures, COLMAP output, and uncompressed `.ply` files never enter Git history — they are
large and irreversible once committed.

Commit a compressed zone file only after its format loads in Spark, it is under 50 MB, and the
repo's ignore rules permit that specific finished file. The current Compressed PLY format is
the next test; keep the approximately 240 MB raw PLY outside Git.

---

*Setup complete → `PLAN.md` for what's next. `DESIGN.md` for why the stack is what it is.*
