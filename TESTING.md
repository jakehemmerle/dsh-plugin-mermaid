# TESTING.md — dsh-plugin-mermaid

Traceability: SPEC property → test file → surface/driver → evidence. Versions under test
(recorded 2026-10-11/12): **DSH 0.2.1-alpha.2** (store
`/nix/store/i24c2k38bz3h86r0v7bjr4amk7d4vxrj-dsh-0.2.1-alpha.2`, the fleet build), unpatched
**dsh-TUI 0.14.0** fixture (repo flake `.#dshTui`, store `66hbj8cp…`), Playwright **1.63.0**
with Nix chromium-1243 (`playwright-driver.browsers`), Node 24, plugin repo at the commits below.

Harness: vendored rig (`test/rig/rig.mjs`, `test/rig/mock-llm.mjs`): private HOME/DSH_HOME,
port 0, private tmux socket, mock model only; the managed `dsh` launcher is never used (it
exports real provider keys). Suites run from the flake devShell env: \`DSH_BIN\`, \`DSH_ROOT\`,
\`DSH_TUI_DIR\`, \`PLAYWRIGHT_BROWSERS_PATH\`.

## Traceability

| Property (SPEC.md) | Test | Surface / driver | Result and evidence |
|---|---|---|---|
| P-01..P-06, P-08, P-09 (generated sequences, invariants after every step) | `test/web/mermaid.web.property.test.ts` + oracle `test/web/model.ts` | real `dsh web` + Playwright, fresh fixture per case | 25 cases seed=20261012 green (156 s, round-1 budget); seeds 1339444460, 104364170, 1665507952 (1-5 cases each) green; NUM_RUNS/FC_SEED/FC_PATH replay |
| P-07 (fence stays code while streaming; renders once at settle) | `test/web/streaming.e2e.test.ts` (paced chunks, held stream) and `sendHeld` action in the property suite | real `dsh web` + Playwright + mock holdAfterText | green; release-to-diagram 1352 ms; 8 held-state samples with no decoration |
| P-10 (identical diagrams get distinct SVG ids) | `test/web/duplicate-ids.test.ts` | real `dsh web` + Playwright | deterministic regression; red 775aace → fix b9a4b1c, green after |
| P-11 (dispose restores DOM, stops reacting, late render applies nothing) | `test/client.dispose.test.ts` | shipped `lib/client.js` + lazy chunk in headless Chromium, stubbed module loader | green (property, 10 cases seed=20261011 + in-flight hold case); real client has no plugin-unload seam — bundle-boundary rationale in file header |
| C-01..C-06 (DSH seam contract) | `test/contract/dsh-seam.contract.test.ts` | reads the pinned DSH store build via \`DSH_ROOT\` | 6/6 green against 0.2.1-alpha.2; a DSH bump that moves CodeBlock props, fiber keying or the loader fails here |
| fence state machine (observe/settle/readFence) | `test/fence.property.test.ts` (fast-check, NUM_RUNS=1000) | unit | green (5 tests) |
| fiber props read (stale alternate) | `test/fiber.test.ts` | unit | green (3 tests) |
| mermaid chunk renders random flowcharts, nothing executable | `test/render.property.test.ts` | headless Chromium on the lazy chunk | green (25 runs/property) |
| TUI inertness (option 3a: web-only plugin) | `test/tui/mermaid.tui.inertness.test.ts` | real dsh-TUI 0.14.0 in a private tmux socket, plugin loaded vs absent | green; row composed in dump-config, no load warnings, two full turns byte-identical (volatile clock/tip/tmpdir normalized); rationale in SPEC.md |

## Red → green (bug found by the new suites)

- **mmd-bwo.10 (P-10)**: two identical mermaid fences shared the SVG element id
  (`["dsh-mermaid-1","dsh-mermaid-1"]`) because the chunk cache returns the first render's
  markup with mermaid's render id stamped in. Red commit 775aace (deterministic real-client
  regression), fix commit b9a4b1c (fresh element id per application). The generated property
  almost never hits the identical pair by chance — the named case pins it.

## Mutation campaign (round 2, 2026-10-12; mutants planted in src/, lib rebuilt, targeted suite run)

| Mutant | Planted bug | Killed by | Result |
|---|---|---|---|
| M1 | dropped \`disposed\` guard in the late-render callback | client.dispose.test.ts "a render in flight when dispose runs applies nothing afterwards" (P-11) | caught |
| M2 | removed the SVG id uniquification (the b9a4b1c fix) | duplicate-ids.test.ts (P-10, real dsh web) | caught |
| M3 | removed dispose cleanup of \`[data-dsh-mermaid]\`/toggle elements | client.dispose.test.ts "dispose removes every trace…" (P-11 restore: "every diagram container must be removed: expected 1 to be 0") | caught |

Caught 3/3. Tree restored (`git checkout`), lib rebuilt from clean src, full suite re-run green
after the campaign.

## Coverage notes / honest gaps

- The web property generator rarely produces two *identical* valid fences in one sequence;
  P-10 is held by the deterministic duplicate-ids case instead (counted above).
- Dispose is exercised at the shipped-bundle boundary; dsh web has no user-facing unload, so
  a real-client dispose path does not exist to drive.
- `nix flake check` across all three systems and `nix run .#e2e` are defined but were only
  exercised for x86_64-linux (`nix build .#default` green, in-derivation tsc + unit checks).
- Round-3 release gate (≥100 cases/surface across ≥3 seeds) is intentionally not started.
