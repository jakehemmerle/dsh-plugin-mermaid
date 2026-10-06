import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DshWeb, startDshWeb } from './dsh-web';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginEntry = join(root, 'lib/index.js');
const artifacts = join(root, 'test/artifacts');
const DIAGRAM_SVG = '[data-dsh-mermaid] svg';
const STRAY = 'body > [id^="dsh-mermaid-"], body > [id^="ddsh-mermaid-"], body > [id^="idsh-mermaid-"]';

let tmp: string;
let server: DshWeb | undefined;
let browser: Browser | undefined;
let page: Page;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'dsh-mermaid-e2e-'));
  const home = join(tmp, 'home');
  execFileSync(process.execPath, [join(root, 'test/seed-home.mjs'), home, pluginEntry], { stdio: 'pipe' });
  server = await startDshWeb(home);
  const url = server.url;
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(url);
  const later = page.getByRole('button', { name: 'Configure later' });
  await later.waitFor({ timeout: 10_000 }).then(() => later.click(), () => undefined);
  await page.getByText('Explaining dsh architecture').first().click();
  await page.locator('.md-code-block').first().waitFor();
});

afterAll(async () => {
  try {
    await browser?.close();
  } finally {
    await server?.stop();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
});

describe('dsh web with the mermaid plugin', () => {
  it('renders every settled mermaid fence as a diagram with a working code toggle', async () => {
    await expect.poll(() => page.locator(DIAGRAM_SVG).count(), { timeout: 60_000 }).toBe(6);
    await page.waitForTimeout(1_000);
    expect(await page.locator(DIAGRAM_SVG).count()).toBe(6);

    const block = page.locator('.md-code-block').filter({ has: page.locator(DIAGRAM_SVG) }).first();
    const diagram = block.locator('[data-dsh-mermaid]');
    const text = await diagram.textContent();
    for (const label of ['dsh-llm plugin', 'ctx.llm', 'dsh-agent-loop plugin']) expect(text).toContain(label);

    const content = block.locator('[data-code-block-content]');
    const display = (locator: typeof content): Promise<string> => locator.evaluate((el) => getComputedStyle(el).display);
    expect(await display(content)).toBe('none');
    mkdirSync(artifacts, { recursive: true });
    await block.screenshot({ path: join(artifacts, 'e2e-diagram.png') });
    await page.screenshot({ path: join(artifacts, 'e2e-page.png') });

    expect(await block.getByRole('button', { name: 'Show code' }).count()).toBe(1);
    await block.getByRole('button', { name: 'Show code' }).click();
    const pre = block.locator('[data-code-block-content] pre');
    await expect.poll(() => pre.isVisible()).toBe(true);
    expect((await pre.textContent())?.startsWith('flowchart LR')).toBe(true);
    expect(await display(diagram)).toBe('none');
    expect(await block.getByRole('button', { name: 'Show diagram' }).count()).toBe(1);
    expect(await block.getByRole('button', { name: 'Show code' }).count()).toBe(0);

    await block.getByRole('button', { name: 'Show diagram' }).click();
    expect(await display(content)).toBe('none');
    expect(await diagram.locator('svg').isVisible()).toBe(true);
    expect(await block.getByRole('button', { name: 'Show code' }).count()).toBe(1);
    expect(await block.locator('[data-dsh-mermaid]').count()).toBe(1);
    expect(await block.locator('[data-dsh-mermaid-toggle]').count()).toBe(1);
  });

  it('re-renders diagrams when the color scheme flips to dark', async () => {
    const block = page.locator('.md-code-block').filter({ has: page.locator(DIAGRAM_SVG) }).first();
    const diagram = block.locator('[data-dsh-mermaid]');
    expect(await diagram.getAttribute('data-dsh-mermaid-theme')).toBe('light');
    const before = await diagram.locator('svg').evaluate((svg) => {
      (svg as unknown as { __before?: true }).__before = true;
      return svg.innerHTML;
    });

    await page.evaluate(() => { document.documentElement.style.colorScheme = 'dark'; });
    await expect.poll(() => diagram.getAttribute('data-dsh-mermaid-theme'), { timeout: 30_000 }).toBe('dark');
    const after = await diagram.locator('svg').evaluate((svg) => ({
      same: (svg as unknown as { __before?: true }).__before === true,
      html: svg.innerHTML,
    }));
    expect(after.same).toBe(false);
    expect(after.html).not.toBe(before);
    await expect.poll(() => page.locator('[data-dsh-mermaid][data-dsh-mermaid-theme="dark"] svg').count(), { timeout: 30_000 }).toBe(6);
    await block.screenshot({ path: join(artifacts, 'e2e-diagram-dark.png') });

    expect(await page.locator(STRAY).count()).toBe(0);
    expect(await page.locator(DIAGRAM_SVG).count()).toBe(6);
  });
});
