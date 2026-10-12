// P-10 as a deterministic example: two identical mermaid fences in one transcript must get
// distinct SVG element ids. Random generation almost never produces the identical pair (the
// generator's label pool is small on purpose, but a collision still needs two identical
// valid segments in one sequence), so the named case pins it. Red against the shipped
// render cache: the cached SVG markup carries the first render's id.
import { describe, expect, it } from 'vitest';
import { closeBrowser, composer, screenshot, startWebFixture } from './fixture';

const FENCE = '```mermaid\nflowchart LR\n  A["alpha"] --> B["beta"]\n```';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('dsh web + dsh-plugin-mermaid (real client, duplicate ids)', () => {
  it('P-10: two identical diagrams get distinct SVG element ids', async () => {
    const f = await startWebFixture();
    try {
      f.replies.push({ text: `${FENCE}\n\n${FENCE}` });
      const box = composer(f.page);
      await box.click();
      await f.page.keyboard.type('draw the same diagram twice');
      await f.page.keyboard.press('Enter');

      const deadline = Date.now() + 30_000;
      let ids: string[] = [];
      while (Date.now() < deadline) {
        ids = await f.page.evaluate(() => [...document.querySelectorAll('[data-dsh-mermaid] > svg')].map((s) => s.id));
        if (ids.length === 2) break;
        await sleep(200);
      }
      expect(ids, 'both identical fences rendered a diagram').toHaveLength(2);
      expect(new Set(ids).size, `svg ids must be unique, got ${JSON.stringify(ids)}`).toBe(ids.length);
      expect(await f.problems, 'P-09: page errors').toEqual([]);
    } catch (error) {
      await screenshot(f.page, 'duplicate-ids');
      throw error;
    } finally {
      await f.dispose();
    }
  }, 60_000);
});
