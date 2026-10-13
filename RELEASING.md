# RELEASING

Releases follow the **new-dsh-plugin** skill's `references/release.md` (SemVer 2.0.0, DSH prerelease channels). This file is the repo-specific procedure. Evidence for every release run is recorded in [TESTING.md](TESTING.md) and the board ([beads](.beads/issues.jsonl), prefix `mmd`).

## Version and channel

- The plugin's own version in `package.json` is SemVer and independent of DSH's number: **MAJOR** incompatible behaviour/config change (MINOR while `0.x`), **MINOR** new user-visible capability, **PATCH** bug fix.
- While the plugin is qualified only against a prerelease DSH, the version carries a matching prerelease channel: `-alpha.N` against a DSH alpha, `-rc.N` against a DSH rc. Drop the suffix only after the full gate passes against a stable DSH. `N` increments per release on the same base version and target channel.
- `nix/package.nix` derives its version from `package.json`; never hardcode a version elsewhere. `pnpm-lock.yaml` unchanged ⇒ `pnpmDeps` hash unchanged.
- `peerDependencies` stay **absent**: the client half is a standalone browser bundle loaded through `window.__ModuleLoader__`, and the Node half is a no-op. The plugin imports no `@deepseek-ai/*` package; the DSH seams it reads (CodeBlock DOM/fibernode/loader) are runtime-duck-typed and pinned by `test/contract/dsh-seam.contract.test.ts` (C-01..C-06) against the exact tested DSH build.
- A new DSH target is a release: run the whole gate against that build first (contract and e2e included), update the pinned versions below, bump this plugin's version, and record the pair in TESTING.md.

## Tested versions (update per release)

| Plugin version | DSH | dsh-TUI | Tag |
|---|---|---|---|
| 0.0.2-alpha.1 | 0.2.1-alpha.2 (fleet store `i24c2k38…`) | 0.14.0 unpatched fixture | `v0.0.2-alpha.1` |

## Gate (from clean `main`, in the flake env)

```sh
git checkout main && git pull --ff-only        # clean tree, CI green
nix develop                                     # pins DSH 0.2.1-alpha.2, dsh-TUI 0.14.0, Nix Chromium, node 24
```

Set `DSH_BIN` to the **fleet store build**, never the managed launcher (it exports real provider keys): `DSH_BIN=/nix/store/i24c2k38…-dsh-0.2.1-alpha.2/bin/dsh`. The mock model only.

1. `nix flake check -L --all-systems` — evaluates all three systems; builds this system's checks (package build + tsc + unit property suites; contract check against the pinned DSH). CI (Linux+macOS runners) covers foreign systems' builds.
2. Fast properties at the release budget: `NUM_RUNS=1000 node_modules/.bin/vitest run --project unit --project browser` (`test/fence.property.test.ts` runs 2000+1000 hardcoded cases; `render.property.test.ts` and `test/client.dispose.test.ts` honour `NUM_RUNS`/`FC_SEED`).
3. Contract suite: `node_modules/.bin/vitest run --project contract` (requires `DSH_ROOT`).
4. Real-client campaigns on the fleet `dsh web` (≥100 generated cases per surface spread over ≥3 logged `FC_SEED` values):
   - `NUM_RUNS=40 FC_SEED=<seed> node_modules/.bin/vitest run --project web test/web/mermaid.web.property.test.ts` — deterministic, `FC_PATH` replayable;
   - `test/web/streaming.e2e.test.ts` ×10; `test/web/duplicate-ids.test.ts` ×5; `test/tui/mermaid.tui.inertness.test.ts` ×5 (loop for flakes — a failure is a bug);
   - `nix run .#e2e` once at default budgets.
5. Update TESTING.md evidence (commit, versions, seeds, counts, latencies), close release beads, then:

```sh
bash ~/.agents/skills/new-dsh-plugin/scripts/preflight.sh dsh-plugin-mermaid --allow-dirty
git add <paths> && git commit -m "5.3 FLASH: release: vX.Y.Z"
bash ~/.agents/skills/new-dsh-plugin/scripts/preflight.sh dsh-plugin-mermaid
git tag -a vX.Y.Z -m "…" && git push && git push origin vX.Y.Z
bash ~/.agents/skills/new-dsh-plugin/scripts/preflight.sh dsh-plugin-mermaid --pushed
```

## After tagging

Consumers pin the tag: nix-config uses `inputs.dsh-plugin-mermaid.url = "github:jakehemmerle/dsh-plugin-mermaid/<tag>"` and installs `${…}.packages.${system}.default/lib/index.js` as the profile row's `name`. Installation and fleet rollout follow the skill's `rollout.md` (local install → Jake's acceptance → fleet sync — never skip the acceptance gate).
