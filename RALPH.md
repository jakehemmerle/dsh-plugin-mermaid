# Ralph loop state

Effort epic: `mmd-bwo` (3 rounds). Read this file and `bd ready` at the start of every round.

## Round 1 (2026-10-11/12) — DONE, reported to lead

- Done: beads initialised (prefix mmd); step beads mmd-bwo.1..9, bug mmd-bwo.10 (duplicate SVG id).
- mmd-bwo.1 closed: main == nix-config pin ca1202b.
- Recovered the interrupted slice's uncommitted work (flake/Nix env, vendored rig, web property
  tests in progress), completed it, tested and committed:
  - 9b6258c "5.3 FLASH: real-client test system: vendored rig, pinned Nix env, web property
    suites, TUI inertness, DSH seam contract (mmd-bwo.3,.4,.5,.6)" — also deletes the old
    seed-home e2e (it copied live ~/.dsh with a Mac workspace key and crashed on this host).
  - 775aace red / b9a4b1c fix: mmd-bwo.10, identical diagrams shared the SVG element id
    (deterministic real-client regression; fix gives every applied diagram a fresh id).
  - SPEC.md written (P-01..P-11, C-01..C-06); beads .2/.3/.4/.5/.6/.10 closed with evidence.
- Evidence (DSH 0.2.1-alpha.2 store build, dsh-TUI 0.14.0 unpatched fixture, chromium-1243):
  - Full vitest suite 22/22 green after the fix (unit 8, contract 6, browser 4, web 3, tui 1).
  - Web property campaign: 25 cases seed=20261012 green (156 s) + seeds 1339444460,
    104364170, 1665507952 earlier (1-5 cases each).
  - Streaming e2e on real dsh web: release-to-diagram 1352 ms.
  - TUI inertness: plugin row composed, no load warnings, byte-identical turns vs no-plugin.
  - nix build .#default green (pnpmDeps sha256-8F4d47WIKU67jKWD/9YYTa/7r2SGkYz7MuirLWD5ZeI=).
- Environment for running suites (also in flake devShell): DSH_BIN
  /nix/store/i24c2k38bz3h86r0v7bjr4amk7d4vxrj-dsh-0.2.1-alpha.2/bin/dsh (NOT the wrapper —
  it exports real provider keys), DSH_ROOT .../lib/node_modules/@deepseek-ai/dsh,
  DSH_TUI_DIR=/nix/store/66hbj8cpgrcxrx99kyhsmq7j6mpvhyn2-dsh-tui-0.14.0/lib/node_modules/@deepseek-harness-tui/dsh-tui,
  PLAYWRIGHT_BROWSERS_PATH=/nix/store/9ibf73nllmrcqx4w7x5jayfxanv2gyfq-playwright-browsers.

## Gotchas

- `bd init` auto-commits and installs Claude/Codex/Cursor hooks and sets `core.hooksPath=.beads/hooks`; that commit was undone and the integrations removed. Don't rerun `bd init`.
- The managed `dsh` launcher exports real provider keys; always set DSH_BIN to the store path.
- execSync from the harness sandbox may fail silently for bd; use spawnSync.
- `lib/client*.js` are gitignored build artifacts (tests build them via test/build.setup.ts).

## Round 2 (2026-10-12, "ROUND A") — DONE, reported to lead

- 63111f6 "5.3 FLASH: SPEC.md (P-01..P-11, C-01..C-06), round-1 state in RALPH.md, beads
  export (mmd-bwo.2,.3,.4,.5,.6,.10 closed)" — pushed (88b7d73..63111f6 on origin/main).
- mmd-bwo.8: mutation campaign **caught 3/3** (mutants planted one at a time in src/client.ts,
  lib rebuilt, targeted acceptance suite failed, tree restored):
  - M1 dropped `disposed` guard in the late-render callback → killed by client.dispose
    in-flight test (P-11).
  - M2 removed the SVG id uniquification → killed by duplicate-ids test on real dsh web (P-10).
  - M3 removed dispose cleanup of containers/toggles → killed by dispose restore property
    ("every diagram container must be removed: expected 1 to be 0").
- mmd-bwo.7: TESTING.md written — full traceability (property → test → surface → evidence),
  seeds/versions recorded, honest gaps listed (dispose at bundle boundary; flake check only
  exercised on x86_64-linux; round-3 release gate not started).
- Full suite re-run after the campaign: 22/22 green (2026-10-12 13:54, same versions).
- Open beads: mmd-bwo.9 (RELEASING.md + CHANGELOG; round-3 release — NOT started, waiting for
  ROUND B) and the epic mmd-bwo.

## Round 2 plan (now historical)

- mmd-bwo.7 TESTING.md traceability table (property → test → surface → seed/versions).
- mmd-bwo.8 mutation campaign: plant ≥3 mutants (dropped disposed guard, missing id
  uniquification, dropped streaming guard), record caught N/N; more red→fix pairs if found.
- mmd-bwo.9 RELEASING.md + CHANGELOG.md per references/release.md.
- Optional: full `nix flake check` across systems; `nix run .#e2e` smoke.

## Round 3 ("ROUND C" — final; closure audit, release campaign, release) — 2026-10-12

### Step 0 — closure audit

- Walked all 9 closed beads (`bd show` each) with recorded evidence.
- Verified: red `775aace` / fix `b9a4b1c` exist (dup-ids bug, mmd-bwo.10); contract/test files as
  recorded; no test reads `~/.dsh` or imports from `~/.agents`; no seed-home remains; all suites
  are real (no skip/todo anywhere, grep-verified); mutation table evidence matches the tree.
- **REOPENED mmd-bwo.3**: its own close reason recorded a residual ("full multi-system nix flake
  check not yet run") that contradicts its acceptance criterion "nix flake check passes". Fixed in
  round C (see below), re-closed with evidence.
- mmd-bwo.5's round-3 campaign criterion (>=100/3 seeds) deliberately belonged to the release gate;
  executed under mmd-bwo.9 this round (all rows below). No other closures falsified.

### Release campaign (DSH 0.2.1-alpha.2 fleet store build via DSH_BIN, dsh-TUI 0.14.0 fixture, Nix chromium-1243, Node 24, mock model only)

- Full baseline suite: 22/22 green (default budgets).
- Web property (P-01..P-06, P-08, P-09, P-10-invariants): **3 seeds x 40 = 120 cases green**
  (`FC_SEED`: `20261012`, `7770001`, `404224`; `NUM_RUNS=40`, `MAX_ACTIONS=8`); replayable
  (`FC_SEED`/`FC_PATH`/`NUM_RUNS`). plus in-flake run seed `1390771577` (5 cases) green.
- Streaming e2e (P-07): ×10 green, release-to-diagram 1325–1422 ms.
- Duplicate-ids regression (P-10): ×5 green.
- TUI inertness: ×5 green (~17.4–17.8 s).
- Fast suites at release budget: dispose property (P-11) **NUM_RUNS=1000** green (seed `20261011`,
  22.2 min) + in-flight case; render property **NUM_RUNS=1000** green (seed `20261012`); unit fence
  property runs hardcoded 2000+1000, fiber deterministic (3 tests).
- Contract: 6/6 standalone and inside the flake derivation.
- `nix run .#e2e`: 8/8 green (142.7 s).
- `nix flake check -L`: "all checks passed!" (x86_64-linux builds: package with tsc+unit,
  contract check); `--all-systems`: all three systems evaluated, checks pass (eval-only for
  foreign systems; CI covers the darwin/linux builds natively).
- Mutants re-planted and re-verified **3/3 caught** (M1 in-flight guard, M2 svg id
  uniquification, M3 dispose cleanup); tree restored, lib rebuilt clean.
- No red this round: nothing broke, no red-commit needed.

### Release

- Version: **0.0.2-alpha.1** (final) (PATCH over deployed pin `ca1202b` = code fix only;
  alpha channel matching DSH 0.2.1-alpha.2; no peerDependencies by design — see RELEASING.md).
- RELEASING.md + CHANGELOG.md added; README de-staled (removed the deleted seed-home e2e
  description, `test/e2e.test.ts` references, Mac install path, and the fixed duplicate-id
  limitation; updated `test:e2e` description).
- Tag `v0.0.2-alpha.1` (annotated) on the release commit; pushed with `origin main`.

Board at end of round C: work beads mmd-bwo.1–.8, .10 closed; mmd-bwo.9 closed (release evidence);
epic mmd-bwo closed last; `bd export` current in `.beads/issues.jsonl`.
