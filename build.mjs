import * as esbuild from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ID = 'dsh-plugin-mermaid';
const root = fileURLToPath(new URL('.', import.meta.url));

const bundles = [
  { entry: 'src/client.ts', file: 'client.js', minify: false },
  { entry: 'src/chunk.ts', file: 'client.mermaid.js', minify: true },
];

function wrap(body, file) {
  const chunk = file === 'client.js' ? '' : ` chunk: ${JSON.stringify(file)},`;
  return `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)},${chunk} factory: (require) => {
"use strict";
var module = { exports: {} };
var exports = module.exports;
${body}
return module.exports;
} });
`;
}

export async function build() {
  const sizes = {};
  for (const { entry, file, minify } of bundles) {
    const result = await esbuild.build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      format: 'cjs',
      platform: 'browser',
      target: 'es2022',
      minify,
      write: false,
      legalComments: 'none',
      logLevel: 'warning',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const text = wrap(result.outputFiles[0].text, file);
    await writeFile(new URL(`lib/${file}`, import.meta.url), text);
    sizes[file] = Buffer.byteLength(text);
  }
  return sizes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sizes = await build();
  for (const [file, bytes] of Object.entries(sizes)) console.log(`lib/${file}  ${(bytes / 1024).toFixed(1)} KiB`);
}
