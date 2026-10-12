// One isolated real `dsh web` + Playwright page per generated case: private HOME/DSH_HOME,
// port 0, local mock model, plugin loaded from this checkout's lib/index.js.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { startMockLlm } from '../rig/mock-llm.mjs';
import { makeProfile, paths, startWeb } from '../rig/rig.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const PLUGIN_ENTRY = join(ROOT, 'lib/index.js');
export const ARTIFACTS = join(ROOT, 'test/artifacts');

export interface Plan { text: string; holdAfterText?: boolean; chunk?: number }

/** Console noise from the stock DSH web app that is not the plugin's (checked without the plugin too). */
// dsh web 0.2.1-alpha.2 probes /open-in-app/icon/<editor> for editors that are not installed (404),
// with or without this plugin.
const ALLOWED_URL = /\/open-in-app\/icon\//;
const ALLOWED_CONSOLE: RegExp[] = [];

export interface WebFixture {
  readonly page: Page;
  readonly mock: Awaited<ReturnType<typeof startMockLlm>>;
  readonly profile: ReturnType<typeof makeProfile>;
  /** Replies for the next agent turns, consumed in order. */
  readonly replies: Plan[];
  readonly problems: string[];
  readonly versions: { dsh: string | null; tuiDir: string | null };
  dispose(): Promise<void>;
}

let shared: Browser | undefined;
export async function browser(): Promise<Browser> {
  shared ??= await chromium.launch();
  return shared;
}
export async function closeBrowser(): Promise<void> {
  await shared?.close();
  shared = undefined;
}

export async function startWebFixture({ plugin = true, viewport = { width: 1300, height: 900 } } = {}): Promise<WebFixture> {
  const replies: Plan[] = [];
  const mock = await startMockLlm({ script: () => replies.shift() ?? { text: 'OK' } });
  const profile = makeProfile({
    kind: 'web', mock,
    plugins: plugin ? [{ id: 'ui-mermaid', name: PLUGIN_ENTRY, config: {} }] : [],
    rows: [{ id: 'ui-settings-general', config: { welcomeNoticeVersion: '2026-09-28.1' } }],
  });
  // First-use default workspace lives under a private Documents directory (Linux would ask xdg-user-dir).
  const documents = join(profile.root, 'Documents');
  mkdirSync(documents);
  appendFileSync(join(profile.dir, 'cordis.patch.yml'), `- ${JSON.stringify({ id: 'workspace-controller', config: { documentsDirectory: documents } })}\n`);
  let web: Awaited<ReturnType<typeof startWeb>> | undefined;
  let context: BrowserContext | undefined;
  try {
    web = await startWeb(profile);
    context = await (await browser()).newContext({ viewport, colorScheme: 'light' });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !ALLOWED_URL.test(m.location().url) && !ALLOWED_CONSOLE.some((r) => r.test(m.text()))) problems.push(`console: ${m.text()} @ ${m.location().url}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !ALLOWED_URL.test(r.url())) problems.push(`http ${r.status()}: ${new URL(r.url()).pathname}`);
    });
    await page.goto(web.url);
    await composer(page).waitFor({ timeout: 60_000 });
    const where = paths();
    const w = web;
    const c = context;
    return {
      page, mock, profile, replies, problems,
      versions: { dsh: where.version, tuiDir: where.tui },
      async dispose() {
        await c.close().catch(() => undefined);
        await w.stop();
        await mock.close();
        profile.dispose();
      },
    };
  } catch (error) {
    await context?.close().catch(() => undefined);
    await web?.stop();
    await mock.close();
    profile.dispose();
    throw error;
  }
}

export function composer(page: Page) {
  return page.getByRole('textbox', { name: /commands, @ files or sessions/ });
}

export async function screenshot(page: Page, name: string): Promise<string> {
  mkdirSync(ARTIFACTS, { recursive: true });
  const path = join(ARTIFACTS, `${name}.png`);
  await page.screenshot({ path, fullPage: true }).catch(() => undefined);
  return path;
}
