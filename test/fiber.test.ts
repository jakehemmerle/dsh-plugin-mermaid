import { describe, expect, it } from 'vitest';
import { codeBlockProps } from '../src/fiber';

interface FakeFiber { memoizedProps: unknown; return?: FakeFiber; alternate?: FakeFiber }

function block(fiber: FakeFiber | undefined, renderedCode?: string): Element {
  return {
    ...(fiber ? { __reactFiber$abc: fiber } : {}),
    querySelector: (selector: string) => (selector === '[data-code-block-content] code' && renderedCode !== undefined ? { textContent: renderedCode } : null),
  } as unknown as Element;
}

function hostOf(props: unknown): FakeFiber {
  return { memoizedProps: { className: 'md-code-block' }, return: { memoizedProps: props } };
}

function pair(stored: unknown, alternate: unknown): FakeFiber {
  const a = hostOf(stored);
  const b = hostOf(alternate);
  a.alternate = b;
  b.alternate = a;
  return a;
}

describe('codeBlockProps', () => {
  const streaming = { code: 'graph TD\n  A --> B\n', lang: 'mermaid', streaming: true };
  const settled = { code: 'graph TD\n  A --> B\n', lang: 'mermaid', streaming: false };
  const partial = { code: 'graph TD\n  A -', lang: 'mermaid', streaming: true };

  it('sees the settle even when the node holds the stale fiber', () => {
    expect(codeBlockProps(block(pair(streaming, settled), 'graph TD\n  A --> B'))).toBe(settled);
    expect(codeBlockProps(block(pair(settled, streaming), 'graph TD\n  A --> B'))).toBe(settled);
  });

  it('ignores a stale chain whose code is not what React rendered', () => {
    expect(codeBlockProps(block(pair(partial, streaming), 'graph TD\n  A --> B'))).toBe(streaming);
    expect(codeBlockProps(block(pair(streaming, partial), 'graph TD\n  A -'))).toBe(partial);
  });

  it('walks at most four fiber levels and requires string code and lang', () => {
    const at = (depth: number, props: unknown): FakeFiber => {
      let fiber: FakeFiber = { memoizedProps: props };
      for (let i = 0; i < depth; i++) fiber = { memoizedProps: { children: [] }, return: fiber };
      return fiber;
    };
    expect(codeBlockProps(block(at(3, settled)))).toBe(settled);
    expect(codeBlockProps(block(at(4, settled)))).toBeUndefined();
    expect(codeBlockProps(block(at(1, { code: 1, lang: 'mermaid' })))).toBeUndefined();
    expect(codeBlockProps(block(undefined))).toBeUndefined();
  });
});
