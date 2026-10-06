export type Theme = 'light' | 'dark';
export interface Fence { readonly code: string; readonly streaming: boolean }
export interface RenderKey { readonly code: string; readonly theme: Theme }
export type RenderResult = { readonly ok: true; readonly svg: string } | { readonly ok: false; readonly message: string };
export type BlockState =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'rendering'; readonly key: RenderKey }
  | { readonly kind: 'rendered'; readonly key: RenderKey; readonly svg: string }
  | { readonly kind: 'failed'; readonly key: RenderKey; readonly message: string };
export type Effect = { readonly kind: 'none' } | { readonly kind: 'render'; readonly key: RenderKey };

const WAITING: BlockState = { kind: 'waiting' };
const NONE: Effect = { kind: 'none' };

/** Boundary parse of untrusted CodeBlock props. Only lang === 'mermaid' (case-insensitive) with string code yields a Fence. Never throws. */
export function readFence(props: unknown): Fence | undefined {
  if (typeof props !== 'object' || props === null) return undefined;
  const { code, lang, streaming } = props as Record<string, unknown>;
  if (typeof lang !== 'string' || lang.toLowerCase() !== 'mermaid' || typeof code !== 'string') return undefined;
  return { code: code.endsWith('\n') ? code.slice(0, -1) : code, streaming: streaming === true };
}

function sameKey(a: RenderKey, b: RenderKey): boolean {
  return a.code === b.code && a.theme === b.theme;
}

/** Fold one observation. Streaming -> waiting/none. Settled with the same key as current rendering|rendered|failed -> unchanged/none (idempotent). Otherwise -> rendering(key)/render(key). */
export function observe(state: BlockState | undefined, fence: Fence, theme: Theme): { state: BlockState; effect: Effect } {
  if (fence.streaming) return { state: state?.kind === 'waiting' ? state : WAITING, effect: NONE };
  const key: RenderKey = { code: fence.code, theme };
  if (state !== undefined && state.kind !== 'waiting' && sameKey(state.key, key)) return { state, effect: NONE };
  return { state: { kind: 'rendering', key }, effect: { kind: 'render', key } };
}

/** Fold a finished render. Applies only when state is rendering with an equal key; any other (stale) result leaves state unchanged. */
export function settle(state: BlockState, key: RenderKey, result: RenderResult): BlockState {
  if (state.kind !== 'rendering' || !sameKey(state.key, key)) return state;
  return result.ok ? { kind: 'rendered', key, svg: result.svg } : { kind: 'failed', key, message: result.message };
}
