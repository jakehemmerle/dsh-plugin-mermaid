// C-01..C-05: the private DSH web seams the plugin reads, pinned against the exact dsh build in DSH_ROOT
// (set by the flake devShell and by `nix flake check`). A DSH bump that moves any of them fails here first.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.env.DSH_ROOT;
if (!ROOT) throw new Error('DSH_ROOT is not set: run inside `nix develop` (or nix flake check) so the pinned dsh is under test');
const pkg = (name: string): string => join(ROOT, 'node_modules/@deepseek-ai', name);
const read = (path: string): string => readFileSync(path, 'utf8');
const primitives = read(join(pkg('dsh-client-ui-primitives'), 'lib/index.js'));

/** The source text of one top-level function in a bundled file. */
function fn(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `function ${name} not found`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\n}\n', start);
  return source.slice(start, next + 2);
}

describe('pinned DSH seams', () => {
  it('C-01: runs the pinned dsh 0.2.1-alpha.2', () => {
    expect(JSON.parse(read(join(ROOT, 'package.json'))).version).toBe('0.2.1-alpha.2');
  });

  it('C-02: CodeBlock takes { code, lang, streaming } props and roots at div.md-code-block', () => {
    const codeBlock = fn(primitives, 'CodeBlock');
    expect(codeBlock).toMatch(/^function CodeBlock\(\{ code, lang, streaming,/);
    expect(codeBlock).toContain('"md-code-block"');
    expect(codeBlock).toContain('"data-code-block-content": true');
    // The plugin reads the rendered source from [data-code-block-content] code.
    expect(codeBlock).toMatch(/jsx\("pre", \{[\s\S]*?jsx\("code", \{/);
  });

  it('C-03: both CodeBlock headers carry [data-code-block-banner] with a <button> to clone the toggle from', () => {
    expect(fn(primitives, 'CodeBlock')).toMatch(/"data-code-block-banner": true[\s\S]*?jsx\("button", \{/);
    expect(fn(primitives, 'CodeToolbar')).toMatch(/"data-code-block-banner": true[\s\S]*?jsx\("button", \{/);
  });

  it('C-04: markdown fences reach CodeBlock with code = value + "\\n", lang = first word of the info string, and the message streaming flag', () => {
    const renderCode = fn(primitives, 'renderCode');
    expect(renderCode).toContain('if (node.value === "") return jsx("pre"');
    expect(renderCode).toContain('/^[\\w-]+/.exec(language)?.[0]');
    expect(renderCode).toMatch(/jsx\(CodeBlock, \{\s*code: `\$\{node\.value\}\\n`,\s*lang,\s*streaming: context\.streaming,/);
  });

  it('C-05: the web frontend is React 18.3.1 and keys DOM fibers as __reactFiber$<random>', () => {
    const assets = join(pkg('dsh-web-frontend'), 'dist/assets');
    const bundles = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => read(join(assets, f)));
    const react = bundles.find((b) => b.includes('reconcilerVersion:"18.3.1'));
    expect(react, 'react-dom 18.3.1 reconciler not found in dsh-web-frontend').toBeDefined();
    expect(react).toMatch(/"__reactFiber\$"\+/);
    expect(react).toMatch(/"__reactProps\$"\+/);
  });

  it('C-06: the client half loads through the module loader (dsh.client.platform web) and lazy chunks via require.async', () => {
    const ours = JSON.parse(read(join(__dirname, '../../package.json')));
    expect(ours.dsh.client.platform).toBe('web');
    expect(ours.exports['./client']).toBe('./lib/client.js');
    const loader = bundles().find((b) => b.includes('__ModuleLoader__'));
    expect(loader, 'window.__ModuleLoader__ not found in dsh-web-frontend').toBeDefined();
    expect(loader).toMatch(/async/);
  });
});

function bundles(): string[] {
  const assets = join(pkg('dsh-web-frontend'), 'dist/assets');
  return readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => read(join(assets, f)));
}
