// dsh-plugin-mermaid has no dsh-TUI surface (option 3a): the web client renders mermaid
// fences; the plugin's Node half is inert outside dsh web. This suite proves that inertness
// on a real dsh-TUI process: with the plugin loaded, the TUI starts, the plugin row is in
// the composed profile, no load warnings appear, a full agent turn renders byte-identically
// to a TUI without the plugin, and the process survives. Any TUI effect the plugin ever
// grows must turn this suite into real TUI properties (see TESTING.md).
import { afterAll, describe, expect, it } from 'vitest';
import { startMockLlm } from '../rig/mock-llm.mjs';
import { makeProfile } from '../rig/rig.mjs';
import { PLUGIN_ENTRY } from '../web/fixture';

const REPLY = 'Here is the diagram:\n\n\`\`\`mermaid\nflowchart LR\n  A["alpha"] --> B["beta"]\n\`\`\`\n\nDone.';
/** Volatile header bits: the per-run tmp dir name, the live clock and the rotating tip line. */
const normalize = (screen: string): string =>
  screen
    .replace(/dsh-rig-tui-.*?\/work/g, 'dsh-rig-tui-X/work')
    .replace(/\b\d{1,2}:\d{2}\b/g, 'TT:TT')
    .replace(/Tip: .*/g, 'Tip: X')
    .trimEnd();

interface TuiProfile {
  readonly profile: ReturnType<typeof makeProfile>;
  readonly tui: ReturnType<typeof makeProfile> extends never ? never : ReturnType<(typeof import('../rig/rig.mjs'))['startTui']>;
  readonly mock: Awaited<ReturnType<typeof startMockLlm>>;
  dispose(): Promise<void>;
}

async function start(withPlugin: boolean): Promise<TuiProfile> {
  const mock = await startMockLlm({ script: () => ({ text: REPLY }) });
  const { startTui } = await import('../rig/rig.mjs');
  const profile = makeProfile({
    kind: 'tui', mock,
    plugins: withPlugin ? [{ id: 'ui-mermaid', name: PLUGIN_ENTRY, config: {} }] : [],
  });
  const tui = startTui(profile);
  await tui.waitFor(/mock-alpha/);
  return {
    profile, tui, mock,
    async dispose() {
      await tui.kill();
      await mock.close();
      profile.dispose();
    },
  };
}

const runTurn = async (f: TuiProfile, label: string): Promise<string> => {
  const turns = f.mock.turns().length;
  await f.tui.submit(`draw ${label}`, { until: () => f.mock.turns().length > turns });
  await f.tui.waitFor(/Done\./, { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1500)); // let any late redraw happen
  return f.tui.capture();
};

describe('dsh-TUI inertness (real dsh-TUI, plugin loaded vs absent)', () => {
  const created: TuiProfile[] = [];
  afterAll(async () => { for (const f of created) await f.dispose().catch(() => undefined); });

  it('a full turn renders identically with and without the plugin, and the plugin loads cleanly', async () => {
    if (!process.env.DSH_TUI_DIR) throw new Error('DSH_TUI_DIR is not set: run inside the flake devShell (or set it to the pinned dsh-tui store path)');
    const withPlugin = await start(true);
    created.push(withPlugin);
    const without = await start(false);
    created.push(without);

    // The plugin row is composed in and its load produced no warnings.
    const dump = await withPlugin.profile.dumpConfig();
    expect(dump.stdout).toContain('ui-mermaid');
    expect(dump.stdout).toContain(PLUGIN_ENTRY);
    expect(withPlugin.profile.logs()).not.toMatch(/ui-mermaid/);

    const screenWith = await runTurn(withPlugin, 'alpha');
    const screenWithout = await runTurn(without, 'alpha');
    expect(normalize(screenWith)).toBe(normalize(screenWithout));

    // Liveness: the same TUI instance serves a second turn fine.
    const screenSecond = await runTurn(withPlugin, 'gamma');
    expect(normalize(screenSecond)).toBe(normalize(await runTurn(without, 'gamma')));
  }, 240_000);
});
