# dsh-plugin-mermaid SPEC

Renders mermaid code fences inside dsh web transcripts as diagrams, in place, with a
code/diagram toggle, theme-aware, safe against untrusted diagram text. The dsh-TUI has no
mermaid surface: the plugin is web-only and must be **inert** there (rationale: diagram
rendering needs a DOM; dsh-TUI shows fences as markdown code text, which is the host's
behavior, not ours). Fleet pins: DSH 0.2.1-alpha.2 (temporary alpha exception, 2026-10-10),
dsh-TUI 0.14.0. Non-goals: editing diagrams, mermaid config UI, TUI rendering, Live
username rules.

State ownership: none on disk; all state is per-element DOM attribute + in-memory render
cache (LRU 200, keyed theme+code). Restarting dsh web or reloading the page re-renders from
the message text. No config keys.

## Seams (contract-pinned)

- Reads `div.md-code-block` elements and their React fiber props \`{code, lang, streaming}\`
  (both \`__reactFiber$\` and \`.alternate\`; stale-alternate settle bug) — C-02, C-04, C-05.
- Decorates only the block: appends \`[data-dsh-mermaid]\` container as last child, adds a
  banner button \`[data-dsh-mermaid-toggle]\` cloned from the header button — C-03.
- Web client half loads via \`window.__ModuleLoader__.load({id, factory})\`, lazy mermaid
  chunk via \`require.async('./client.mermaid.js')\` — C-06.
- Node half: \`apply() {}\` no-op (web-only plugin).

## Acceptance properties

| ID | Property (oracle is test/web/model.ts, never plugin code) | Web (real dsh web + Playwright) | Other evidence |
|---|---|---|---|
| P-01 | Every fence in the transcript is a code block showing exactly the model's code, after any action sequence | mermaid.web.property.test.ts (generated sequences, invariants each step) | — |
| P-02 | Every valid mermaid fence renders exactly one diagram whose text contains all node labels | same | render.property.test.ts (chunk) |
| P-03 | Non-mermaid fences are never decorated and their code stays visible | same | — |
| P-04 | Each valid block has exactly one toggle; Show code/Show diagram flips both ways, persisted only as the DOM attribute until reload resets to diagram | same (incl. reload action) | — |
| P-05 | Diagrams render for the current theme (light/dark emulated colorScheme) | same (theme action) | — |
| P-06 | Invalid mermaid → single error line "Mermaid: <first error line>", no toggle, code visible, no diagram | same | fence.property.test.ts |
| P-07 | While a message streams, its closed fences stay plain code (no container, no toggle, code visible) and settled blocks are untouched; after settle the diagram appears once | same (sendHeld action) + streaming.e2e.test.ts (paced chunks, release-to-diagram latency) | — |
| P-08 | Rendered diagram content is inert: no \`<script>\`, no \`on*\` attributes, no \`javascript:\` hrefs | same (executable check per block) | render.property.test.ts |
| P-09 | No page errors, console errors or failed requests beyond the allowlisted stock-app noise | every case asserts problems == [] | — |
| P-10 | Identical diagrams get distinct SVG element ids | duplicate-ids.test.ts (deterministic; property generator rarely collides) | — |
| P-11 | Disposing the plugin restores the original DOM exactly and stops reacting (style, containers, toggles, VIEW attributes gone; late renders apply nothing) | client.dispose.test.ts on shipped lib/client.js (real client has no plugin-unload seam; bundle boundary) | — |

Contract C-01..C-06 pin the DSH seams above against the exact dsh build (test/contract).
TUI inertness (option 3a): with the plugin loaded a real dsh-TUI starts, the row is composed,
no load warnings, and full turns render byte-identically to a TUI without the plugin
(test/tui/mermaid.tui.inertness.test.ts).

## Rejected-action and boundary behavior

- Streaming blocks are never decorated until the fence settles (P-07); busy turns need no
  plugin-side queueing (host streams; we only observe the DOM).
- Unreadable fiber props / non-code-block mutations: leave the DOM untouched (readFence
  returns undefined → strip is a no-op on foreign nodes).
- Render failures (invalid mermaid, chunk load failure) degrade to the error line or plain
  code, never remove the user's text (P-06), and the plugin keeps working for later blocks.
- Corrupt/missing state: no state files exist; nothing to validate.
