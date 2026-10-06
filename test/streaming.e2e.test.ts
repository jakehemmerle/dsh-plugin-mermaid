import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Locator, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DshWeb, startDshWeb } from './dsh-web';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginEntry = join(root, 'lib/index.js');
const artifacts = join(root, 'test/artifacts');
const PROMPT = 'Draw the streaming test diagram';
const REPLY = 'Here is a diagram:\n\n```mermaid\nflowchart LR\n  A["stream start"] --> B["stream end"]\n```\n\nDone.';
const CHUNK_CHARS = 6;
const CHUNK_GAP_MS = 150;
const HOLD_SAMPLES = 8;
const HOLD_SAMPLE_GAP_MS = 250;

const log = (message: string): void => console.log(`[streaming-e2e ${new Date().toISOString().slice(11, 23)}] ${message}`);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

interface MockLlm {
  readonly port: number;
  /** Resolves once the whole reply text (closing fence included) is on the wire and the stream is being held open. */
  readonly held: Promise<void>;
  /** Unblocks the held stream: sends the finish_reason "stop" chunk, usage and [DONE]. */
  release(): void;
  close(): Promise<void>;
}

/** Minimal OpenAI Chat Completions server. The agent turn streams REPLY in small chunks, then waits for release(). */
async function startMockLlm(): Promise<MockLlm> {
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  let markHeld!: () => void;
  const held = new Promise<void>((resolve) => { markHeld = resolve; });
  let agentTurns = 0;

  const chunk = (delta: object, finish: string | null = null): object => ({
    id: 'chatcmpl-mock', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'mock-model',
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };

  const streamReply = async (res: ServerResponse, text: string, hold: boolean): Promise<void> => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const send = (data: object | string): void => { res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`); };
    send(chunk({ role: 'assistant', content: '' }));
    for (let i = 0; i < text.length; i += CHUNK_CHARS) {
      if (res.destroyed) return;
      send(chunk({ content: text.slice(i, i + CHUNK_CHARS) }));
      if (hold) await sleep(CHUNK_GAP_MS);
    }
    if (hold) {
      log('mock: reply fully streamed, holding the stream open (no finish_reason, no [DONE])');
      markHeld();
      await gate;
      log('mock: released, sending finish_reason "stop" + [DONE]');
    }
    send(chunk({}, 'stop'));
    send({ id: 'chatcmpl-mock', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'mock-model', choices: [], usage });
    send('[DONE]');
    res.end();
  };

  const handle = (req: IncomingMessage, res: ServerResponse, body: string): void => {
    let json: { stream?: boolean; messages?: { role: string; content: unknown }[]; tools?: unknown[] } = {};
    try { json = body ? JSON.parse(body) : {}; } catch { /* logged below */ }
    const system = JSON.stringify(json.messages?.find((m) => m.role === 'system')?.content ?? '');
    const user = JSON.stringify(json.messages?.filter((m) => m.role === 'user').map((m) => m.content) ?? []);
    log(`mock: ${req.method} ${req.url} stream=${json.stream} messages=${json.messages?.length ?? 0} tools=${json.tools?.length ?? 0} system=${system.slice(0, 60)}… hasPrompt=${user.includes(PROMPT)}`);
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model', object: 'model', created: 0, owned_by: 'mock' }] }));
      return;
    }
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `mock: no route ${req.method} ${req.url}` } }));
      return;
    }
    const isTitle = system.includes('concise title');
    const isAgentTurn = !isTitle && user.includes(PROMPT) && agentTurns === 0;
    if (isAgentTurn) agentTurns++;
    const text = isAgentTurn ? REPLY : isTitle ? 'Mermaid streaming test' : 'OK';
    if (json.stream !== true) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-mock', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'mock-model',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage,
      }));
      return;
    }
    void streamReply(res, text, isAgentTurn);
  };

  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (part: Buffer) => { body += part.toString(); });
    req.on('end', () => handle(req, res, body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    held,
    release: () => releaseGate(),
    close: () => new Promise<void>((resolve) => {
      releaseGate();
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

const PATCH = (port: number): string => `- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      mock:
        displayName: Mock
        apiKeyEnv: MOCK_LLM_KEY
        api: openai-completions
        baseURL: http://127.0.0.1:${port}/v1
        models:
          - id: mock-model
            name: Mock
            contextWindow: 128000
            maxTokens: 4096
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: mock
    model: mock-model
`;

interface BlockSample { readonly pre: string; readonly containers: number; readonly toggles: number }

const sample = (block: Locator): Promise<BlockSample> => block.evaluate((el) => ({
  pre: el.querySelector('pre')?.textContent ?? '',
  containers: el.querySelectorAll('[data-dsh-mermaid]').length,
  toggles: el.querySelectorAll('[data-dsh-mermaid-toggle]').length,
}));

/** memoizedProps (code/lang/streaming + key list) for up to 4 levels of the stored __reactFiber$ chain and of its .alternate chain. */
const fiberDump = (block: Locator): Promise<unknown> => block.evaluate((el) => {
  type Fiber = { memoizedProps?: Record<string, unknown> | null; return?: Fiber | null; alternate?: Fiber | null; type?: unknown };
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  const stored = key === undefined ? undefined : (el as unknown as Record<string, Fiber>)[key];
  const chain = (start: Fiber | null | undefined): unknown[] => {
    const out: unknown[] = [];
    for (let fiber = start, depth = 0; fiber && depth < 4; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps ?? {};
      const type = typeof fiber.type === 'string' ? fiber.type : (fiber.type as { name?: string } | null)?.name ?? typeof fiber.type;
      out.push({ depth, type, keys: Object.keys(props), code: props.code, lang: props.lang, streaming: props.streaming });
    }
    return out;
  };
  return { fiberKey: key, stored: chain(stored), alternate: chain(stored?.alternate) };
});

let tmp: string;
let mock: MockLlm | undefined;
let server: DshWeb | undefined;
let browser: Browser | undefined;
let page: Page;

async function shot(name: string): Promise<void> {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, `streaming-${name}.png`) }).catch(() => undefined);
  log(`screenshot test/artifacts/streaming-${name}.png`);
}

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    await shot(`fail-${name}`);
    throw error;
  }
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'dsh-mermaid-stream-'));
  const home = join(tmp, 'home');
  execFileSync(process.execPath, [join(root, 'test/seed-home.mjs'), home, pluginEntry], { stdio: 'pipe' });
  mock = await startMockLlm();
  appendFileSync(join(home, 'profiles/web/cordis.patch.yml'), PATCH(mock.port));
  server = await startDshWeb(home, { MOCK_LLM_KEY: 'test' });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(server.url);
});

afterAll(async () => {
  try {
    await browser?.close();
  } finally {
    await mock?.close();
    await server?.stop();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
});

describe('dsh web with the mermaid plugin, live streaming', () => {
  it('keeps a closed mermaid fence as code while its message streams, then renders it once the message settles', async () => {
    const llm = mock!;
    const composer = page.getByRole('textbox', { name: /commands, @ files or sessions/ });
    await step('open', async () => {
      const later = page.getByRole('button', { name: 'Configure later' });
      await Promise.race([later.waitFor({ timeout: 10_000 }), composer.waitFor({ timeout: 10_000 })]).catch(() => undefined);
      if (await later.isVisible()) await later.click();
      await page.getByRole('button', { name: 'New Session' }).first().click();
      await composer.click({ timeout: 30_000 });
    });
    await step('send', async () => {
      await page.keyboard.type(PROMPT);
      await page.keyboard.press('Enter');
      await within(llm.held, 60_000, 'mock LLM never received/streamed the agent turn');
    });

    const block = page.locator('.md-code-block').filter({ hasText: 'stream end' });
    await step('held', async () => {
      await expect.poll(async () => (await block.count()) === 1 && (await sample(block)).pre.includes('B["stream end"]'), { timeout: 15_000 }).toBe(true);
      log(`held-state fiber props: ${JSON.stringify(await fiberDump(block))}`);
      await shot('held');
      for (let i = 0; i < HOLD_SAMPLES; i++) {
        const s = await sample(block);
        expect(s.pre.startsWith('flowchart LR'), `pre text: ${JSON.stringify(s.pre)}`).toBe(true);
        expect(s.containers, `sample ${i}: [data-dsh-mermaid] while streaming`).toBe(0);
        expect(s.toggles, `sample ${i}: [data-dsh-mermaid-toggle] while streaming`).toBe(0);
        await sleep(HOLD_SAMPLE_GAP_MS);
      }
    });

    await page.evaluate(() => {
      const w = window as unknown as { __diagramAt?: number };
      const check = (): void => {
        if (w.__diagramAt === undefined && document.querySelector('.md-code-block [data-dsh-mermaid] svg') !== null) w.__diagramAt = Date.now();
      };
      new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
      check();
    });
    const releasedAt = Date.now();
    llm.release();
    log('test: released the held stream');
    const svg = block.locator('[data-dsh-mermaid] svg');
    try {
      await expect.poll(() => svg.count(), { timeout: 10_000, intervals: [50] }).toBe(1);
    } catch (error) {
      const dump = JSON.stringify(await fiberDump(block).catch((e: unknown) => String(e)), null, 2);
      log(`settle NOT detected; fiber props of the block:\n${dump}`);
      await shot('fail-settle');
      throw new Error(`diagram did not appear within 10 s of release. Fiber props:\n${dump}`, { cause: error });
    }
    const diagramAt = await page.evaluate(() => (window as unknown as { __diagramAt?: number }).__diagramAt);
    const latency = (diagramAt ?? Date.now()) - releasedAt;
    log(`release-to-diagram latency: ${latency} ms`);
    console.log(`RELEASE_TO_DIAGRAM_MS=${latency}`);
    log(`settled-state fiber props: ${JSON.stringify(await fiberDump(block))}`);

    const text = (await svg.textContent()) ?? '';
    expect(text).toContain('stream start');
    expect(text).toContain('stream end');
    expect(await block.locator('[data-code-block-content]').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    expect(await block.getByRole('button', { name: 'Show code' }).count()).toBe(1);
    await shot('settled');
    await block.screenshot({ path: join(artifacts, 'streaming-settled-block.png') });
  });
});
