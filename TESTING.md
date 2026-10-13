# TESTING.md — dsh-plugin-mermaid

Traceability: SPEC property → test file → surface/driver → evidence. Versions under test
(recorded 2026-10-11/12; release run 2026-10-12): **DSH 0.2.1-alpha.2** — the fleet store
build `/nix/store/i24c2k38bz3h86r0v7bjr4amk7d4vxrj-dsh-0.2.1-alpha.2` via `DSH_BIN`/`DSH_ROOT`,
unpatched **dsh-TUI 0.14.0** fixture (repo flake `.#dshTui`, store `66hbj8cp…`), Playwright
**1.63.0** with Nix chromium-1243 (`playwright-driver.browsers`), Node 24. Release candidate: plugin
**0.0.2-alpha.1** (tagged in this repo's CHANGELOG; source under test is the round-C campaign tree).

Harness: vendored rig (`test/rig/rig.mjs`, `test/rig/mock-llm.mjs`): private HOME/DSH_HOME,
port 0, private tmux socket, mock model only; the managed `dsh` launcher is never used (it
exports real provider keys). Suites run from the flake devShell env: `DSH_BIN`, `DSH_ROOT`,
`DSH_TUI_DIR`, `PLAYWRIGHT_BROWSERS_PATH`.

## Traceability

| Property (SPEC.md) | Test | Surface / driver | Result and evidence |
|---|---|---|---|
| P-01..P-06, P-08, P-09 (generated sequences, invariants after every step) | `test/web/mermaid.web.property.test.ts` + oracle `test/web/model.ts` | real `dsh web` + Playwright, fresh fixture per case | Release campaign 2026-10-12 (round C): **40 cases per seed × 3 seeds = 120 green**: seeds `20261012`, `7770001`, `404224` (`MAX_ACTIONS=8`); replayable via `FC_SEED`/`FC_PATH`/`NUM_RUNS`. Earlier: round-1 seed `20261012` 25 cases green (156 s); seeds `1339444460`, `104364170`, `1665507952` (1-5 cases each) green |
| P-07 (fence stays code while streaming; renders once at settle) | `test/web/streaming.e2e.test.ts` (paced chunks, held stream) and `sendHeld` action in the property suite | real `dsh web` + Playwright + mock holdAfterText | Release run: **×10 consecutive green**, release-to-diagram 1325-1422 ms (80 held-state samples total; no decoration while held). Round-1 examples: 1352 ms / 1389 ms |
| P-10 (identical diagrams get distinct SVG ids) | `test/web/duplicate-ids.test.ts` | real `dsh web` + Playwright | Release run: ×5 consecutive green; deterministic regression; red `775aace` → fix `b9a4b1c`, green after |
| P-11 (dispose restores DOM, stops reacting, late render applies nothing) | `test/client.dispose.test.ts` | shipped `lib/client.js` + lazy chunk in headless Chromium, stubbed module loader | Release run: property **NUM_RUNS=1000 green** (seed `20261011`, 22.2 min) + in-flight hold case green; real client has no plugin-unload seam — bundle-boundary rationale in file header |
| C-01..C-06 (DSH seam contract) | `test/contract/dsh-seam.contract.test.ts` | reads the pinned DSH store build via `DSH_ROOT` | 6/6 green against 0.2.1-alpha.2 both standalone and inside `nix flake check`'s contract derivation; a DSH bump that moves CodeBlock props, fiber keying or the loader fails here |
| fence state machine (observe/settle/readFence) | `test/fence.property.test.ts` (fast-check, hardcoded numRuns 2000 + 1000) | unit | green (5 tests); runs inside the Nix package build too |
| fiber props read (stale alternate) | `test/fiber.test.ts` | unit | green (3 tests) |
| mermaid chunk renders random flowcharts, nothing executable | `test/render.property.test.ts` | headless Chromium on the lazy chunk | Release run: **NUM_RUNS=1000 green** (seed `20261012`); suite now honours `NUM_RUNS`/`FC_SEED` (default seed 20261012, verbose) |
| TUI inertness (option 3a: web-only plugin) | `test/tui/mermaid.tui.inertness.test.ts` | real dsh-TUI 0.14.0 in a private tmux socket, plugin loaded vs absent | Release run: ×5 consecutive green (~17.4-17.8 s each); row composed in dump-config, no load warnings, turns byte-identical (volatile clock/tip/tmpdir normalized); rationale in SPEC.md |

Release-gate in-flake run: `nix run .#e2e` (browser + web + tui projects at default budgets) — see RALPH.md round 3 for the recorded result and the `nix flake check` evidence.

## Red → green (bug found by the new suites)

- **mmd-bwo.10 (P-10)**: two identical mermaid fences shared the SVG element id
  (`["dsh-mermaid-1","dsh-mermaid-1"]`) because the chunk cache returns the first render's
  markup with mermaid's render id stamped in. Red commit 775aace (deterministic real-client
  regression), fix commit b9a4b1c (fresh element id per application). The generated property
  almost never hits the identical pair by chance — the named case pins it.

## Mutation campaign (round 2 2026-10-12; re-planted and re-verified 2026-10-12 round C; mutants in src/client.ts, lib rebuilt, targeted suite run, tree restored)

| Mutant | Planted bug | Killed by | Result |
|---|---|---|---|
| M1 | dropped `disposed` guard in the late-render callback | client.dispose.test.ts "a render in flight when dispose runs applies nothing afterwards" (P-11) | caught again (round C): "the late render result must not be applied after disposal: expected 1 to be +0" |
| M2 | removed the SVG id uniquification (the b9a4b1c fix) | duplicate-ids.test.ts (P-10, real dsh web) | caught again (round C): "svg ids must be unique, got [\"dsh-mermaid-1\",\"dsh-mermaid-1\"]" |
| M3 | removed dispose cleanup of `[data-dsh-mermaid]`/toggle/view attrs | client.dispose.test.ts "dispose removes every trace…" (P-11 restore) | caught again (round C): "every diagram container must be removed: expected 1 to be +0" |

Caught 3/3 in the round-2 campaign and 3/3 again on re-verification in round C. Tree restored
(`git checkout`), lib rebuilt from clean src, full suite re-run green after.

## Coverage notes / honest gaps

- The web property generator rarely produces two *identical* valid fences in one sequence;
  P-10 is held by the deterministic duplicate-ids case instead (counted above).
- Dispose is exercised at the shipped-bundle boundary; dsh web has no user-facing unload, so
  a real-client dispose path does not exist to drive.
- `nix flake check -L --all-systems` (2026-10-12): evaluates all three systems (x86_64-linux,
  aarch64-linux, aarch64-darwin) — "all checks passed!"; the x86_64-linux checks were fully
  built (package + tsc + unit/contract suites). Foreign systems are evaluation-checked locally
  because Linux cannot build them by construction; CI (Linux + macOS runners) runs the same
  check with native builds.
- Release budget note: the ≥100-cases/surface campaign ran over 3 seeds of 40 cases
  (`MAX_ACTIONS=8`, matching the round-1 evidence). testing.md's default long-sequences
  (up to 30 actions) was consciously not increased — justify in SPEC §state ownership: blocks
  are independent DOM decorations, cross-block actions do not compose hidden state.
- Suites never skip silently: there are no `.skip`/`.todo` tests in the repo (verified by
  grep before the release commit).
