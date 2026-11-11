import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, '../cancel-trial-owner-preview');
await mkdir(output, { recursive: true });
await build({
  configFile: false,
  root,
  publicDir: false,
  resolve: { alias: { '@': root } },
  define: { 'process.env.NODE_ENV': '"production"' },
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    outDir: output,
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: resolve(root, 'tests/fixtures/cancel-trial-preview.tsx'),
      name: 'CancelTrialPreview',
      formats: ['iife'],
      fileName: () => 'preview.js',
    },
  },
});
execFileSync(
  process.execPath,
  [
    resolve(root, 'node_modules/tailwindcss/lib/cli.js'),
    '-c',
    resolve(root, 'tailwind.config.ts'),
    '-i',
    resolve(root, 'app/globals.css'),
    '--content',
    './components/admin/CancelIntroTrialForm.tsx,./tests/fixtures/cancel-trial-preview.tsx',
    '-o',
    resolve(output, 'preview.css'),
    '--minify',
  ],
  { cwd: root, stdio: 'inherit' },
);
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";
await writeFile(
  resolve(output, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Rhyze Cancel trial · NONPRODUCTION review</title><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js" defer></script></body></html>`,
);
await writeFile(
  resolve(output, '_headers'),
  `/*\n  Content-Security-Policy: ${csp}\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n`,
);
const allowlist = ['_headers', 'index.html', 'preview.css', 'preview.js'];
if (
  JSON.stringify((await readdir(output)).sort()) !== JSON.stringify(allowlist)
)
  throw Error('Preview contains files outside the explicit static allowlist');
const files = await Promise.all(
  allowlist.map(async (name) => {
    const bytes = await readFile(resolve(output, name));
    return {
      name,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }),
);
await writeFile(
  resolve(root, '../evidence/cancel-trial-preview-allowlist.json'),
  JSON.stringify(
    { nonproduction: true, synthetic: true, inert: true, files },
    null,
    2,
  ),
);
console.log('Prepared inert static allowlist:', output);
