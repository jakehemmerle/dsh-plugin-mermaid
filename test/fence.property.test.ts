import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type BlockState, type Fence, observe, type RenderKey, type RenderResult, readFence, settle, type Theme } from '../src/fence';

const theme = fc.constantFrom<Theme>('light', 'dark');
const code = fc.oneof(fc.constantFrom('flowchart LR\n  A --> B', 'graph TD; x', ''), fc.string({ maxLength: 12 }));
const fence: fc.Arbitrary<Fence> = fc.record({ code, streaming: fc.boolean() });
const key: fc.Arbitrary<RenderKey> = fc.record({ code, theme });
const result: fc.Arbitrary<RenderResult> = fc.oneof(
  fc.record({ ok: fc.constant(true as const), svg: fc.string() }),
  fc.record({ ok: fc.constant(false as const), message: fc.string() }),
);
const lang = fc.oneof(fc.constantFrom('mermaid', 'MERMAID', 'Mermaid', 'mermaid ', 'js', ''), fc.string(), fc.anything());

type Step = { kind: 'observe'; fence: Fence; theme: Theme } | { kind: 'settle'; key: RenderKey; result: RenderResult };
const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant('observe' as const), fence, theme }),
  fc.record({ kind: fc.constant('settle' as const), key, result }),
);

function keyOf(state: BlockState | undefined): RenderKey | undefined {
  return state === undefined || state.kind === 'waiting' ? undefined : state.key;
}

describe('readFence', () => {
  it('accepts exactly string code with lang "mermaid" in any case, and never throws', () => {
    const props = fc.oneof(
      fc.anything(),
      fc.record({ lang, code: fc.oneof(fc.string(), fc.anything()), streaming: fc.oneof(fc.boolean(), fc.anything()) }, { requiredKeys: [] }),
    );
    fc.assert(fc.property(props, (input) => {
      const fenceOrUndefined = readFence(input);
      const record = typeof input === 'object' && input !== null ? input as Record<string, unknown> : undefined;
      const accepted = typeof record?.lang === 'string' && record.lang.toLowerCase() === 'mermaid' && typeof record.code === 'string';
      expect(fenceOrUndefined !== undefined).toBe(accepted);
      if (fenceOrUndefined === undefined || record === undefined) return;
      const source = record.code as string;
      expect(fenceOrUndefined.code).toBe(source.endsWith('\n') ? source.slice(0, -1) : source);
      expect(fenceOrUndefined.streaming).toBe(record.streaming === true);
    }), { numRuns: 2000 });
  });

  it('strips exactly one trailing newline', () => {
    expect(readFence({ lang: 'mermaid', code: 'graph TD\n\n' })).toEqual({ code: 'graph TD\n', streaming: false });
  });
});

describe('observe', () => {
  it('emits render effects only for settled observations, keyed by the observed code and theme', () => {
    fc.assert(fc.property(fc.array(fc.record({ fence, theme }), { maxLength: 40 }), (observations) => {
      let state: BlockState | undefined;
      for (const { fence: f, theme: t } of observations) {
        const next = observe(state, f, t);
        if (f.streaming) {
          expect(next.effect).toEqual({ kind: 'none' });
          expect(next.state).toEqual({ kind: 'waiting' });
        }
        if (next.effect.kind === 'render') {
          expect(f.streaming).toBe(false);
          expect(next.effect.key).toEqual({ code: f.code, theme: t });
          expect(next.state).toEqual({ kind: 'rendering', key: next.effect.key });
        }
        state = next.state;
      }
    }));
  });

  it('is idempotent: re-observing the same fence and theme emits none and keeps state equal', () => {
    fc.assert(fc.property(fc.array(step, { maxLength: 30 }), fence, theme, (history, f, t) => {
      let state: BlockState | undefined;
      for (const s of history) state = s.kind === 'observe' ? observe(state, s.fence, s.theme).state : state && settle(state, s.key, s.result);
      const first = observe(state, f, t);
      const again = observe(first.state, f, t);
      expect(again.effect).toEqual({ kind: 'none' });
      expect(again.state).toEqual(first.state);
    }));
  });
});

describe('settle', () => {
  it('never lands a stale completion, and converges on the last settled observation', () => {
    fc.assert(fc.property(fc.array(step, { maxLength: 40 }), fc.record({ code, theme }), result, (steps, last, finalResult) => {
      let state: BlockState | undefined;
      for (const s of steps) {
        if (s.kind === 'observe') {
          state = observe(state, s.fence, s.theme).state;
          continue;
        }
        if (state === undefined) continue;
        const current = keyOf(state);
        const next = settle(state, s.key, s.result);
        const fresh = state.kind === 'rendering' && current?.code === s.key.code && current.theme === s.key.theme;
        if (!fresh) expect(next).toEqual(state);
        else expect(next).toEqual(s.result.ok
          ? { kind: 'rendered', key: s.key, svg: s.result.svg }
          : { kind: 'failed', key: s.key, message: s.result.message });
        state = next;
      }
      const K: RenderKey = { code: last.code, theme: last.theme };
      state = observe(state, { code: K.code, streaming: false }, K.theme).state;
      const final = settle(state, K, finalResult);
      expect(final.kind === 'rendered' || final.kind === 'failed').toBe(true);
      expect(keyOf(final)).toEqual(K);
    }), { numRuns: 1000 });
  });
});
