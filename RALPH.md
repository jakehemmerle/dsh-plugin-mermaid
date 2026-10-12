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

## Round 2 plan (next)

- mmd-bwo.7 TESTING.md traceability table (property → test → surface → seed/versions).
- mmd-bwo.8 mutation campaign: plant ≥3 mutants (dropped disposed guard, missing id
  uniquification, dropped streaming guard), record caught N/N; more red→fix pairs if found.
- mmd-bwo.9 RELEASING.md + CHANGELOG.md per references/release.md.
- Optional: full `nix flake check` across systems; `nix run .#e2e` smoke.
