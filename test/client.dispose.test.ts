// P-11 (dispose) on the shipped browser bundle: unloading the plugin restores the original
// code blocks exactly (style, containers, toggles and VIEW attributes gone, content visible)
// and stops reacting: later blocks are never decorated, and a render that was in flight when
// dispose ran applies nothing. Drives the real lib/client.js + lib/client.mermaid.js in
// headless Chromium behind a stubbed module loader — the same artifact dsh web loads. The
// full real-client product properties live in test/web/ (P-01..P-10); the real client has no
// external way to unload a plugin, so dispose is exercised here at the bundle boundary.
import fc from 'fast-check';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';

const CLIENT = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const CHUNK = fileURLToPath(new URL('../lib/client.mermaid.js', import.meta.url));

const NUM_RUNS = Number(process.env.NUM_RUNS ?? 10);
const SEED = process.env.FC_SEED === undefined ? 20261011 : Number(process.env.FC_SEED);

declare global {
  interface Window {
    __plugin: { apply(ctx: { effect(fn: () => () => void): unknown }): unknown };
    __chunk: { render(key: { code: string; theme: string }, id: string): Promise<unknown> };
    __chunkImpl: { render(key: { code: string; theme: string }, id: string): Promise<unknown> };
    __hold: boolean;
    __install(blocks: { code: string; lang: string }[]): void;
    __snap(): { styles: number; containers: number; toggles: number; views: number; visible: string[]; codes: string[] };
    __reset(): void;
    __apply(): void;
    __teardown(): void;
    __armHold(): void;
    __held: { resolve(result: unknown) }[];
  }
}

async function newPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.evaluate(() => {
    window.__ModuleLoader__ = {
      load(registration: { chunk?: string; factory: (require: unknown) => unknown }) {
        if (registration.chunk === 'client.mermaid.js') {
          window.__chunkImpl = registration.factory(() => { throw new Error('chunk requires nothing'); }) as Window['__chunk'];
          return;
        }
        // The plugin memoizes one chunk object forever (module-level `chunk ??=`), and the
        // esbuild export is a getter-only property, so a render wrapper cannot be swapped in
        // afterwards. Hand the plugin a dispatching proxy instead; tests reach for
        // window.__chunkImpl and window.__hold directly.
        window.__chunk = {
          render(key, id) {
            if (window.__hold) {
              let resolve;
              const promise = new Promise((res) => { resolve = res; });
              window.__held.push({ resolve });
              return promise;
            }
            return window.__chunkImpl.render(key, id);
          },
        } as Window['__chunk'];
        const chunkReady = new Promise<Window['__chunk']>((resolve) => {
          const check = (): void => {
            if (window.__chunk) resolve(window.__chunk);
            else setTimeout(check, 5);
          };
          check();
        });
        const loaderRequire = { async: (spec: string): Promise<Window['__chunk']> => {
          if (spec.endsWith('client.mermaid.js')) return chunkReady;
          return Promise.reject(new Error('unexpected require.async ' + spec));
        } };
        window.__plugin = registration.factory(loaderRequire) as Window['__plugin'];
      },
    };
    window.__install = (blocks) => {
      for (const b of blocks) {
        const root = document.createElement('div');
        root.className = 'md-code-block';
        const banner = document.createElement('div');
        banner.setAttribute('data-code-block-banner', 'true');
        const actions = document.createElement('div');
        const copy = document.createElement('button');
        copy.textContent = 'Copy';
        actions.append(copy);
        banner.append(actions);
        const content = document.createElement('div');
        content.setAttribute('data-code-block-content', 'true');
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = b.code;
        pre.append(code);
        content.append(pre);
        root.append(banner, content);
        // React's fiber keys are enumerable own properties; codeBlockProps reads them with Object.keys.
        Object.defineProperty(root, '__reactFiber$dispose-test', { configurable: true, enumerable: true, value: { memoizedProps: { code: b.code, lang: b.lang, streaming: false } } });
        document.body.append(root);
      }
    };
    window.__snap = () => ({
      styles: document.head.querySelectorAll('[data-dsh-mermaid-style]').length,
      containers: document.querySelectorAll('[data-dsh-mermaid]').length,
      toggles: document.querySelectorAll('[data-dsh-mermaid-toggle]').length,
      views: document.querySelectorAll('[data-dsh-mermaid-view]').length,
      visible: [...document.querySelectorAll('.md-code-block [data-code-block-content]')].map((c) => getComputedStyle(c).display),
      codes: [...document.querySelectorAll('.md-code-block [data-code-block-content] code')].map((c) => c.textContent ?? ''),
    });
    window.__reset = () => {
      document.body.replaceChildren();
      for (const style of document.head.querySelectorAll('[data-dsh-mermaid-style]')) style.remove();
    };
    window.__apply = () => {
      window.__plugin.apply({ effect(fn) { window.__teardown = fn(); return undefined; } });
    };
    window.__armHold = () => {
      window.__held = [];
      window.__hold = true;
    };
  });
  await page.addScriptTag({ path: CHUNK });
  await page.addScriptTag({ path: CLIENT });
  return page;
}

const flowchart = (tag: string): string => `flowchart LR\n  a${tag}["start"] --> b${tag}["end"]\n`;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitForContainers(page: Page, n: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await page.evaluate(() => window.__snap())).containers === n) return;
    await sleep(100);
  }
  throw new Error(`only ${(await page.evaluate(() => window.__snap())).containers}/${n} diagrams rendered`);
}

describe('lib/client.js dispose in headless Chromium', () => {
  const browserP = chromium.launch();
  afterAll(async () => { await (await browserP).close(); });

  it('P-11: dispose removes every trace, keeps the original content visible and stops reacting', async () => {
    console.log(`[dispose-property] seed=${SEED} numRuns=${NUM_RUNS}`);
    const page = await newPage(await browserP);
    let cases = 0;
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: 1, max: 3 }),
      fc.constantFrom('light', 'dark'),
      async (n, theme) => {
        cases += 1;
        const tag = `c${cases}`;
        await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
        await page.evaluate(() => window.__reset());
        await page.evaluate((defs) => window.__install(defs), Array.from({ length: n }, () => ({ code: flowchart(tag), lang: 'mermaid' })));
        await page.evaluate(() => window.__apply());
        await waitForContainers(page, n);
        const before = await page.evaluate(() => window.__snap());
        expect(before.styles).toBe(1);
        expect(before.containers).toBe(n);
        expect(before.toggles).toBe(n);
        expect(before.codes).toHaveLength(n);
        for (const code of before.codes) expect(code).toContain('flowchart LR');

        await page.evaluate(() => window.__teardown());
        const after = await page.evaluate(() => window.__snap());
        expect(after.styles, 'the plugin style tag must be removed').toBe(0);
        expect(after.containers, 'every diagram container must be removed').toBe(0);
        expect(after.toggles, 'every toggle button must be removed').toBe(0);
        expect(after.views, 'every data-dsh-mermaid-view attribute must be stripped').toBe(0);
        expect(after.visible, 'original code content must be visible again').not.toContain('none');
        expect(after.codes, 'original code text must survive disposal').toEqual(before.codes);

        await page.evaluate((code) => window.__install([{ code, lang: 'mermaid' }]), flowchart(tag + 'late'));
        await sleep(1200);
        const settled = await page.evaluate(() => window.__snap());
        expect(settled.containers, 'disposed plugin must not decorate new blocks').toBe(0);
        expect(settled.styles, 'disposed plugin must not re-add its style').toBe(0);
      },
    ), { seed: SEED, numRuns: NUM_RUNS, verbose: 1 });
    console.log(`[dispose-property] PASS seed=${SEED} cases=${cases}`);
  });

  it('P-11: a render in flight when dispose runs applies nothing afterwards', async () => {
    const page = await newPage(await browserP);
    await page.evaluate(() => window.__armHold());
    await page.evaluate((code) => window.__install([{ code, lang: 'mermaid' }]), flowchart('hold'));
    await page.evaluate(() => window.__apply());
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if ((await page.evaluate(() => window.__held.length)) > 0) break;
      await sleep(50);
    }
    expect(await page.evaluate(() => window.__held.length), 'render should have been called and held').toBeGreaterThan(0);
    await page.evaluate(() => window.__teardown());
    await page.evaluate((svg) => { for (const h of window.__held) h.resolve({ ok: true, svg }); }, '<svg><text>late</text></svg>');
    await sleep(800);
    const snap = await page.evaluate(() => window.__snap());
    expect(snap.containers, 'the late render result must not be applied after disposal').toBe(0);
    expect(snap.styles).toBe(0);
    expect(snap.toggles).toBe(0);
    await page.close();
  });
});
