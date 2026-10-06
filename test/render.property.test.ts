import fc from 'fast-check';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RenderKey, RenderResult } from '../src/fence';

const CHUNK = fileURLToPath(new URL('../lib/client.mermaid.js', import.meta.url));
const HOSTILE = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', 'javascript:alert(1)', '" onmouseover="alert(1)', '<a href="javascript:alert(1)">x</a>'];

interface Inspection {
  readonly result: RenderResult;
  readonly text: string;
  readonly scripts: number;
  readonly handlers: readonly string[];
  readonly jsHrefs: readonly string[];
  readonly bodyChildren: number;
}

declare global {
  interface Window { __chunk: { render(key: RenderKey, id: string): Promise<RenderResult> } }
}

let browser: Browser;
let page: Page;
let seq = 0;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.evaluate(() => {
    (window as unknown as { __ModuleLoader__: unknown }).__ModuleLoader__ = {
      load(registration: { chunk?: string; factory: (require: (spec: string) => never) => Window['__chunk'] }) {
        if (registration.chunk !== 'client.mermaid.js') throw new Error(`unexpected registration ${registration.chunk}`);
        window.__chunk = registration.factory((spec) => { throw new Error(`unexpected require(${spec})`); });
      },
    };
  });
  await page.addScriptTag({ path: CHUNK });
});

afterAll(async () => {
  await browser?.close();
});

function inspect(code: string): Promise<Inspection> {
  return page.evaluate(async ({ code, id }) => {
    const result = await window.__chunk.render({ code, theme: 'light' }, id);
    const bodyChildren = document.body.children.length;
    if (!result.ok) return { result, text: '', scripts: 0, handlers: [], jsHrefs: [], bodyChildren };
    const svg = new DOMParser().parseFromString(result.svg, 'text/html').body.querySelector('svg');
    if (svg === null) throw new Error('no svg element in render output');
    for (const style of svg.querySelectorAll('style')) style.remove();
    const all = [svg, ...svg.querySelectorAll('*')];
    const attrs = all.flatMap((el) => [...el.attributes]);
    return {
      result,
      text: svg.textContent ?? '',
      scripts: svg.querySelectorAll('script').length,
      handlers: attrs.filter((a) => a.name.toLowerCase().startsWith('on')).map((a) => `${a.name}=${a.value}`),
      jsHrefs: attrs.filter((a) => /^(xlink:)?href$/i.test(a.name) && /^\s*javascript:/i.test(a.value)).map((a) => a.value),
      bodyChildren,
    };
  }, { code, id: `prop-${++seq}` });
}

const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();

const plainLabel = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,14}[A-Za-z0-9]$/);
const label = fc.oneof(
  { weight: 3, arbitrary: plainLabel.map((text) => ({ text, hostile: false })) },
  { weight: 1, arbitrary: fc.tuple(fc.stringMatching(/^[A-Za-z0-9 ]{0,4}$/), fc.constantFrom(...HOSTILE), fc.stringMatching(/^[A-Za-z0-9 ]{0,4}$/)).map(([a, h, b]) => ({ text: a + h + b, hostile: true })) },
);
const flowchart = fc.integer({ min: 1, max: 8 }).chain((n) => fc.record({
  direction: fc.constantFrom('TD', 'LR'),
  labels: fc.array(label, { minLength: n, maxLength: n }),
  edges: fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 10 }),
}));

describe('mermaid chunk in headless Chromium', () => {
  it('renders random flowcharts with every plain label visible and nothing executable', async () => {
    await fc.assert(fc.asyncProperty(flowchart, async ({ direction, labels, edges }) => {
      const source = [
        `flowchart ${direction}`,
        ...labels.map((l, i) => `  n${i}["${l.text.replaceAll('"', '#quot;')}"]`),
        ...edges.map(([a, b]) => `  n${a} --> n${b}`),
      ].join('\n');
      const seen = await inspect(source);
      expect(seen.result, source).toMatchObject({ ok: true });
      const text = normalize(seen.text);
      for (const l of labels) if (!l.hostile) expect(text, source).toContain(normalize(l.text));
      expect(seen.scripts, source).toBe(0);
      expect(seen.handlers, source).toEqual([]);
      expect(seen.jsHrefs, source).toEqual([]);
      expect(seen.bodyChildren, source).toBe(0);
    }), { numRuns: 25, verbose: true });
  });

  it('turns an invalid diagram into ok:false and leaves the body clean', async () => {
    const seen = await inspect('flowchart LR\n A -->');
    expect(seen.result.ok).toBe(false);
    expect(seen.result.ok === false && seen.result.message.trim().length > 0).toBe(true);
    expect(seen.bodyChildren).toBe(0);
  });
});
