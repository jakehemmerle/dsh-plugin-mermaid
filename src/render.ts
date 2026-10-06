import type { RenderKey, RenderResult } from './fence';

declare const require: { async(spec: string): Promise<unknown> };

interface Chunk { render(key: RenderKey, id: string): Promise<RenderResult> }

const CACHE_LIMIT = 200;
const cache = new Map<string, Promise<RenderResult>>();
let chunk: Promise<Chunk> | undefined;

export function renderMermaid(key: RenderKey, id: string): Promise<RenderResult> {
  const memo = `${key.theme}\n${key.code}`;
  const hit = cache.get(memo);
  if (hit !== undefined) return hit;
  chunk ??= require.async('./client.mermaid.js') as Promise<Chunk>;
  const result = chunk.then(
    (mod) => mod.render(key, id),
    (error: unknown): RenderResult => {
      chunk = undefined;
      cache.delete(memo);
      return { ok: false, message: `could not load renderer: ${error instanceof Error ? error.message : String(error)}` };
    },
  );
  cache.set(memo, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return result;
}
