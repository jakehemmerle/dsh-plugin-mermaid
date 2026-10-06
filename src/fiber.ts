interface Fiber { readonly memoizedProps?: unknown; readonly return?: Fiber | null; readonly alternate?: Fiber | null }
interface Props { readonly code: string; readonly lang: string; readonly streaming?: unknown }

const MAX_DEPTH = 4;

function propsAbove(start: Fiber | null | undefined): Props | undefined {
  let fiber = start;
  for (let depth = 0; fiber && depth < MAX_DEPTH; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps as Partial<Props> | null | undefined;
    if (typeof props?.code === 'string' && typeof props.lang === 'string') return props as Props;
  }
  return undefined;
}

const chomp = (s: string): string => (s.endsWith('\n') ? s.slice(0, -1) : s);

export function codeBlockProps(el: Element): unknown {
  const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  if (fiberKey === undefined) return undefined;
  const stored = (el as unknown as Record<string, Fiber | undefined>)[fiberKey];
  // React sets a node's fiber only at creation (and its __reactProps$ only on DOM-visible updates), so
  // the stored fiber is the stale alternate after every other commit; a settle that changes no DOM
  // can leave it reading streaming: true forever. So read both chains: the current props have the code
  // React rendered into the DOM, and among those settled wins, because a block never goes from
  // settled back to streaming with identical code.
  const candidates = [propsAbove(stored), propsAbove(stored?.alternate)].filter((p): p is Props => p !== undefined);
  if (candidates.length < 2) return candidates[0];
  const rendered = el.querySelector('[data-code-block-content] code')?.textContent ?? undefined;
  const live = candidates.filter((p) => rendered !== undefined && chomp(p.code) === chomp(rendered));
  const pool = live.length > 0 ? live : candidates;
  return pool.find((p) => p.streaming !== true) ?? pool[0];
}
