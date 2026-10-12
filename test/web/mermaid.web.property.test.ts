// P-01..P-10 on the real dsh web client: generated action sequences, invariants after every step.
// Replay: FC_SEED=<seed> [FC_PATH=<path>] NUM_RUNS=<n> pnpm exec vitest run --project web
import fc from 'fast-check';
import type { Page } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { closeBrowser, composer, screenshot, startWebFixture, type WebFixture } from './fixture';
import { type Action, actions, addTurn, type Model, type PageSnap, replyText, violations } from './model';

const NUM_RUNS = Number(process.env.NUM_RUNS ?? 5);
const SEED = process.env.FC_SEED === undefined ? Date.now() ^ (Math.random() * 0x7fffffff) : Number(process.env.FC_SEED);
const PATH = process.env.FC_PATH;
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS ?? 8);
const SETTLE_MS = 30_000;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function snapshot(page: Page): Promise<PageSnap> {
  return page.evaluate(() => {
    const blocks = [...document.querySelectorAll('.md-code-block')].map((root) => {
      const content = root.querySelector('[data-code-block-content]');
      const containers = root.querySelectorAll(':scope > [data-dsh-mermaid]');
      const c = containers[0] as HTMLElement | undefined;
      const executable: string[] = [];
      for (const el of c ? [c, ...c.querySelectorAll('*')] : []) {
        if (el.tagName.toLowerCase() === 'script') executable.push('script');
        for (const a of el.attributes) {
          if (/^on/i.test(a.name)) executable.push(a.name);
          if (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) executable.push('javascript:');
        }
      }
      return {
        code: content?.querySelector('code')?.textContent ?? '',
        contentDisplay: content ? getComputedStyle(content).display : 'missing',
        containers: containers.length,
        containerIsLast: c !== undefined && root.lastElementChild === c,
        containerDisplay: c ? getComputedStyle(c).display : null,
        error: c?.hasAttribute('data-dsh-mermaid-error') ?? false,
        text: c?.textContent ?? '',
        theme: c?.getAttribute('data-dsh-mermaid-theme') ?? null,
        svgs: c ? c.querySelectorAll(':scope > svg').length : 0,
        toggles: [...root.querySelectorAll('[data-dsh-mermaid-toggle]')].map((t) => t.getAttribute('aria-label') ?? ''),
        executable,
      };
    });
    const svgIds = [...document.querySelectorAll('[data-dsh-mermaid] > svg')].map((s) => s.id);
    const stray = document.querySelectorAll('body > [id^="dsh-mermaid-"], body > [id^="ddsh-mermaid-"], body > [id^="idsh-mermaid-"]').length;
    return { blocks, svgIds, stray, empties: 0 };
  });
}

async function settle(page: Page, model: Model, label: string): Promise<void> {
  const deadline = Date.now() + SETTLE_MS;
  let last: string[] = [];
  while (Date.now() < deadline) {
    last = violations(model, await snapshot(page));
    if (last.length === 0) return;
    await sleep(200);
  }
  throw new Error(`${label}: invariants did not hold within ${SETTLE_MS} ms:\n  ${last.join('\n  ')}`);
}

async function send(f: WebFixture, model: Model, action: Extract<Action, { t: 'send' | 'sendHeld' }>): Promise<void> {
  const marker = `end-of-turn-${model.turns + 1}`;
  const held = action.t === 'sendHeld';
  f.replies.push({ text: replyText(action.segs, marker), holdAfterText: held, chunk: 24 });
  const turns = f.mock.turns().length;
  const box = composer(f.page);
  await box.click();
  await f.page.keyboard.type(`prompt ${model.turns + 1}`);
  await f.page.keyboard.press('Enter');
  const deadline = Date.now() + 30_000;
  while (f.mock.turns().length === turns) {
    if (Date.now() > deadline) throw new Error('mock never received the turn');
    await sleep(100);
  }
  const before = model.blocks.length;
  addTurn(model, action.segs);
  await f.page.getByText(marker, { exact: true }).waitFor({ timeout: 30_000 });
  if (held) {
    // P-07: every fence of the still-streaming message stays plain code; earlier blocks are unaffected.
    await f.page.waitForFunction((n) => document.querySelectorAll('.md-code-block').length >= n, model.blocks.length, { timeout: 15_000 });
    for (let i = 0; i < 6; i++) {
      const snap = await snapshot(f.page);
      snap.blocks.slice(before).forEach((b, j) => {
        expect(b.containers + b.toggles.length, `P-07: streaming block ${before + j} decorated while held (sample ${i})`).toBe(0);
        expect(b.contentDisplay, `P-07: streaming block ${before + j} code hidden while held`).not.toBe('none');
      });
      const earlier = violations({ ...model, blocks: model.blocks.slice(0, before) }, { ...snap, blocks: snap.blocks.slice(0, before) }).filter((v) => !v.startsWith('P-02: ') || !v.includes('diagrams, model'));
      expect(earlier, 'P-07: settled blocks changed while another message streams').toEqual([]);
      await sleep(250);
    }
    f.mock.hold(false);
  }
}

async function toggle(f: WebFixture, model: Model, pick: number): Promise<void> {
  const valid = model.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === 'valid');
  if (valid.length === 0) {
    // Rejected action: there is nothing to toggle; the page must be unchanged (checked by settle()).
    expect(await f.page.locator('[data-dsh-mermaid-toggle]').count()).toBe(0);
    return;
  }
  const { b, i } = valid[pick % valid.length]!;
  const block = f.page.locator('.md-code-block').nth(i);
  await block.scrollIntoViewIfNeeded();
  await block.locator('[data-dsh-mermaid-toggle]').click();
  b.view = b.view === 'diagram' ? 'code' : 'diagram';
}

async function reload(f: WebFixture, model: Model): Promise<void> {
  await f.page.reload();
  await composer(f.page).waitFor({ timeout: 60_000 });
  if (model.blocks.length > 0 && (await f.page.locator('.md-code-block').count()) === 0) {
    await f.page.getByText('Mock title').first().click();
  }
  // A fresh DOM starts every diagram in diagram view.
  for (const b of model.blocks) b.view = 'diagram';
}

async function run(f: WebFixture, seq: Action[], trace: string[]): Promise<void> {
  const model: Model = { blocks: [], theme: 'light', turns: 0 };
  for (const [n, a] of seq.entries()) {
    trace.push(`#${n} ${JSON.stringify(a)}`);
    if (a.t === 'send' || a.t === 'sendHeld') await send(f, model, a);
    else if (a.t === 'toggle') await toggle(f, model, a.pick);
    else if (a.t === 'theme') { await f.page.emulateMedia({ colorScheme: a.theme }); model.theme = a.theme; }
    else await reload(f, model);
    await settle(f.page, model, `after #${n} ${a.t}`);
    expect(f.problems, 'P-09: page errors, console errors or failed requests').toEqual([]);
  }
}

describe('dsh web + dsh-plugin-mermaid (real client, generated sequences)', () => {
  afterAll(closeBrowser);

  it('keeps every mermaid fence in the transcript in the specified state after every action', async () => {
    let cases = 0;
    console.log(`[web-property] seed=${SEED}${PATH ? ` path=${PATH}` : ''} numRuns=${NUM_RUNS} maxActions=${MAX_ACTIONS}`);
    await fc.assert(fc.asyncProperty(actions(MAX_ACTIONS), async (seq) => {
      const n = ++cases;
      const trace: string[] = [];
      const f = await startWebFixture();
      try {
        await run(f, seq, trace);
      } catch (error) {
        const shot = await screenshot(f.page, `web-property-seed${SEED}-case${n}`);
        throw new Error(`case ${n} failed (seed=${SEED}); screenshot ${shot}\ntrace:\n${trace.join('\n')}\n${(error as Error).message}\nproblems: ${JSON.stringify(f.problems)}`, { cause: error });
      } finally {
        await f.dispose();
      }
    }), { seed: SEED, path: PATH, numRuns: NUM_RUNS, endOnFailure: process.env.FC_SHRINK !== '1', verbose: 1 });
    console.log(`[web-property] PASS seed=${SEED} cases=${cases}`);
  });
});
