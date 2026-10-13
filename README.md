# dsh-plugin-mermaid

A DeepSeek Harness (DSH) web GUI plugin that renders ```` ```mermaid ```` code fences in chat messages as diagrams.

- Settled mermaid fences show the diagram inside the stock code-block card. A toggle button in the card header ("Show code" / "Show diagram") switches between the diagram and its source. The Copy button still copies the source.
- Fences that are still streaming stay as plain code until the message settles.
- Diagrams re-render when DSH switches between light and dark (`document.documentElement.style.colorScheme`).
- If a diagram has a syntax error, the code stays visible with a muted `Mermaid: <error>` line under it.
- mermaid (v12, `securityLevel: 'strict'`) lives in a lazy chunk, `lib/client.mermaid.js`, so it loads only after the first mermaid fence appears. Page boot loads only the small `lib/client.js`.

## Install

```sh
pnpm install
pnpm build   # writes lib/client.js and lib/client.mermaid.js
```

Add this row to your DSH web profile patch (for example `~/.dsh/profiles/web/cordis.patch.yml`). The `name` must be the absolute path to the Node entry file; a directory path fails with `ERR_UNSUPPORTED_DIR_IMPORT`.

```yaml
- insert:
    - id: ui-mermaid
      name: /path/to/dsh-plugin-mermaid/lib/index.js
```

Disabling the plugin removes its observers, injected nodes, `<style>` element and data attributes.

## How it detects mermaid fences

DSH renders every fence through a React `CodeBlock` component with root `div.md-code-block`. For mermaid the visible label is the generic "Code block", so the language is not in the DOM. The plugin reads it from React's fiber props instead: it takes the element's `__reactFiber$…` fiber, walks up at most 4 levels, and uses the first `memoizedProps` that has string `code` and `lang` fields (`src/fiber.ts`). The same props carry `streaming`. When a message settles, the DOM may not change at all, so a MutationObserver can miss it. While any mermaid block is still streaming, the plugin also rescans every 500 ms.

A DOM node keeps the fiber it was created with. After every other commit, that fiber is the stale alternate. So the plugin reads the props chain of both the fiber and its alternate. It keeps the props whose `code` matches the text React rendered into `[data-code-block-content] code`, and if both match, it prefers the settled one.

The per-block logic is a pure state machine in `src/fence.ts`. Its states are waiting, rendering, rendered and failed. It is idempotent per (code, theme), and it drops stale render completions.

## Development

```sh
pnpm build        # esbuild -> lib/client.js + lib/client.mermaid.js (module-loader wrapped CJS)
pnpm typecheck
pnpm test         # all tests
pnpm test:unit    # fast-check properties of the pure core
pnpm test:e2e     # real clients: shipped bundles in Chromium + Playwright campaigns on real `dsh web` + dsh-TUI inertness
```

The real-client suites run against a real `dsh web` and a real `dsh-TUI` on the vendored rig (`test/rig/`): every run gets its own private `HOME`/`DSH_HOME`, free port and private tmux socket, and the only model is the local mock (`test/rig/mock-llm.mjs`). Nothing reads a live `~/.dsh` or `~/.dsh-tui`; set `DSH_BIN`, `DSH_ROOT`, `DSH_TUI_DIR` and `PLAYWRIGHT_BROWSERS_PATH` to pinned store builds (see `flake.nix`'s devShell) and run the suites via `nix develop`.

- `test/web/mermaid.web.property.test.ts` — fast-check generated action sequences (send / held send / toggle / theme / reload) against the real web client, invariants checked after every step; replay with `NUM_RUNS`, `FC_SEED`, `FC_PATH`.
- `test/web/streaming.e2e.test.ts` — paced-chunk streaming: the fence stays plain code while the turn streams, then renders once after settle; prints `RELEASE_TO_DIAGRAM_MS=…`.
- `test/web/duplicate-ids.test.ts` — two identical fences get distinct SVG element ids.
- `test/render.property.test.ts`, `test/client.dispose.test.ts` — the shipped lazy chunk and browser bundle in headless Chromium (render properties incl. hostile labels; dispose restores the DOM and stops reacting).
- `test/tui/mermaid.tui.inertness.test.ts` — the plugin is web-only; on a real dsh-TUI the row composes, loads without warnings and full turns render byte-identically to a TUI without the plugin.
- `test/contract/dsh-seam.contract.test.ts` — pins the DSH seams (CodeBlock props, banner, fiber keying, module loader) against the exact `DSH_ROOT` build.

Suites write screenshots to `test/artifacts/` on failure.

## Nix

The flake builds the plugin for `x86_64-linux`, `aarch64-linux` and `aarch64-darwin`. `packages.<system>.default` contains only `lib/` and `package.json`. Its build runs `tsc --noEmit` and the `unit` vitest project, and `checks.<system>.default` is the same package.

```sh
nix build github:jakehemmerle/dsh-plugin-mermaid   # result/lib/index.js
nix flake check -L
```

As a flake input, use `${dsh-plugin-mermaid.packages.${system}.default}/lib/index.js` as the `name` in the profile patch row above. After a `pnpm-lock.yaml` change, update `hash` in `nix/package.nix` with the value Nix reports.

CI (`.github/workflows/nix.yml`) runs `nix flake check -L` on Linux and macOS runners, so the package build with its tsc + unit checks and the DSH-seam contract check is exercised on both OSes. The real-client web/TUI suites need the pinned `dsh web`, `dsh-TUI` and Nix Chromium of the flake devShell, so they run locally or in the repo environment (`nix run .#e2e`).

## Limitations

- The plugin depends on DSH `CodeBlock` internals: the `.md-code-block`, `[data-code-block-banner]` and `[data-code-block-content]` hooks, and the React fiber props `{ code, lang, streaming }`. If DSH changes them, the plugin finds no fences and you see the stock code block. Nothing breaks.
- The diagram replaces the code view only visually. React still owns and renders the code block. The plugin adds a single container as the last child of the card and a single button in the header actions.
- `lib/client.mermaid.js` is about 5 MB (about 1.5 MB gzipped), because the full mermaid build is bundled, including elk/cytoscape/katex. It loads once, on demand.
