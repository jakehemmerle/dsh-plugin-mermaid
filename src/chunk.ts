import mermaid from 'mermaid';
import type { RenderKey, RenderResult } from './fence';

let queue: Promise<unknown> = Promise.resolve();

// mermaid.initialize mutates global config, so each initialize+render pair runs alone.
export function render(key: RenderKey, id: string): Promise<RenderResult> {
  const job = queue.then(async (): Promise<RenderResult> => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: key.theme === 'dark' ? 'dark' : 'default',
    });
    try {
      const { svg } = await mermaid.render(id, key.code);
      return { ok: true, svg };
    } catch (error) {
      return { ok: false, message: (error instanceof Error ? error.message : String(error)) || 'render failed' };
    } finally {
      for (const stray of [id, `d${id}`, `i${id}`]) {
        const el = document.getElementById(stray);
        if (el?.parentElement === document.body) el.remove();
      }
    }
  });
  queue = job;
  return job;
}
