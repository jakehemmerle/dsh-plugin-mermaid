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
      name: /Users/jake/code/dsh-plugin-mermaid/lib/index.js
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
pnpm test:e2e     # headless Chromium: mermaid chunk properties + end-to-end against a real `dsh web`
```

The e2e test seeds an isolated `DSH_HOME` in a temp directory (`test/seed-home.mjs`) with a copy of the "Explaining dsh architecture" session from `~/.dsh`. It starts `dsh web --port 0`, then shuts it down at the end. It writes screenshots to `test/artifacts/`. You can override the binary with `DSH_BIN`.

The streaming e2e test (`test/streaming.e2e.test.ts`) seeds the same kind of home. It points the agent at a mock OpenAI Chat Completions server through a `mock` provider route. The mock streams a reply that contains a mermaid fence, then holds the stream open after the closing fence. The test checks that the block stays plain code while the message is unfinished. It then releases the stream and checks that the diagram appears within 10 s. It prints the release-to-diagram latency as `RELEASE_TO_DIAGRAM_MS=…`.

## Limitations

- The plugin depends on DSH `CodeBlock` internals: the `.md-code-block`, `[data-code-block-banner]` and `[data-code-block-content]` hooks, and the React fiber props `{ code, lang, streaming }`. If DSH changes them, the plugin finds no fences and you see the stock code block. Nothing breaks.
- The diagram replaces the code view only visually. React still owns and renders the code block. The plugin adds a single container as the last child of the card and a single button in the header actions.
- `lib/client.mermaid.js` is about 5 MB (about 1.5 MB gzipped), because the full mermaid build is bundled, including elk/cytoscape/katex. It loads once, on demand.
- If the exact same diagram appears twice in a transcript, both copies reuse the memoized SVG, which has the same element id. Arrow markers resolve to the first copy.
