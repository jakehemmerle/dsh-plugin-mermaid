// P-07 as a deterministic example: a closed mermaid fence arrives in small chunks inside a
// message that keeps streaming; the fence stays plain code while held, then renders exactly
// once when the turn settles. Companion to the generated test/web/mermaid.web.property.test.ts
// (which covers the same invariant across random sequences); this file keeps the paced-chunk
// scenario and the release-to-diagram latency measurement from the original e2e.
import type { Page } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { closeBrowser, composer, screenshot, startWebFixture } from './fixture';

const PROMPT = 'Draw the streaming test diagram';
const REPLY = 'Here is a diagram:\n\n\`\`\`mermaid\nflowchart LR\n  A["stream start"] --> B["stream end"]\n\`\`\`\n\nDone.';
const CHUNK_CHARS = 6;
const CHUNK_GAP_MS = 150;
const HOLD_SAMPLES = 8;
const HOLD_SAMPLE_GAP_MS = 250;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const sample = (page: Page): Promise<{ pre: string; containers: number; toggles: number }> =>
  page.evaluate(() => {
    const block = [...document.querySelectorAll('.md-code-block')].find((b) => (b.querySelector('pre')?.textContent ?? '').includes('stream end'));
    if (block === undefined) return { pre: '', containers: -1, toggles: -1 };
    return {
      pre: block.querySelector('pre')?.textContent ?? '',
      containers: block.querySelectorAll('[data-dsh-mermaid]').length,
      toggles: block.querySelectorAll('[data-dsh-mermaid-toggle]').length,
    };
  });

describe('dsh web + dsh-plugin-mermaid (real client, paced streaming)', () => {
  afterAll(closeBrowser);

  it('keeps a closed mermaid fence as code while its message streams, then renders it once the message settles', async () => {
    const f = await startWebFixture();
    try {
      f.replies.push({ text: REPLY, holdAfterText: true, chunk: CHUNK_CHARS });
      const box = composer(f.page);
      await box.click();
      await f.page.keyboard.type(PROMPT);
      await f.page.keyboard.press('Enter');

      // The whole reply (closing fence included) is on the wire while the stream is held open.
      const deadline = Date.now() + 60_000;
      let s = await sample(f.page);
      while (Date.now() < deadline && !s.pre.endsWith('Done.')) {
        await sleep(200);
        s = await sample(f.page);
      }
      expect(s.pre.startsWith('flowchart LR'), `pre text: ${JSON.stringify(s.pre)}`).toBe(true);

      for (let i = 0; i < HOLD_SAMPLES; i++) {
        const held = await sample(f.page);
        expect(held.containers, `sample ${i}: [data-dsh-mermaid] while streaming`).toBe(0);
        expect(held.toggles, `sample ${i}: [data-dsh-mermaid-toggle] while streaming`).toBe(0);
        await sleep(HOLD_SAMPLE_GAP_MS);
      }
      await screenshot(f.page, 'streaming-held');
      await expect(f.problems, 'P-09: page errors while streaming').toEqual([]);

      f.mock.hold(false);
      const releasedAt = Date.now();
      const svg = f.page.locator('.md-code-block', { hasText: 'stream end' }).locator('[data-dsh-mermaid] svg');
      await svg.waitFor({ timeout: 10_000 });
      console.log(`RELEASE_TO_DIAGRAM_MS=${Date.now() - releasedAt}`);

      const text = (await svg.textContent()) ?? '';
      expect(text).toContain('stream start');
      expect(text).toContain('stream end');
      const block = f.page.locator('.md-code-block', { hasText: 'stream end' });
      expect(await block.locator('[data-code-block-content]').evaluate((el) => getComputedStyle(el).display)).toBe('none');
      expect(await block.getByRole('button', { name: 'Show code' }).count()).toBe(1);
      await screenshot(f.page, 'streaming-settled');
      await expect(f.problems, 'P-09: page errors after settle').toEqual([]);
    } finally {
      await f.dispose();
    }
  });
});
