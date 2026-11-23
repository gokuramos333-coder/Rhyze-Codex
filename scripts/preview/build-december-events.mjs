import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = resolve(root, 'preview/december-events');
const output = resolve(root, 'build/december-events-preview');
await mkdir(output, { recursive: true });
await build({
  configFile: false,
  root,
  publicDir: false,
  resolve: {
    alias: [
      { find: 'next/link', replacement: resolve(fixture, 'navigation.tsx') },
      { find: '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions', replacement: resolve(fixture, 'native-actions.ts') },
      { find: '@', replacement: root },
    ],
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  oxc: { jsx: { runtime: 'automatic' } },
  plugins: [{
    name: 'preview-client-only',
    generateBundle() {
      const forbidden = [...this.getModuleIds()].filter((id) =>
        /\/(app|lib\/(db|auth))\/|\/(stripe|auth\.ts)\b|\/lib\/payments\/(?!black-friday-new-friend\.ts)/.test(id));
      if (forbidden.length) throw new Error('Server dependency in preview: ' + forbidden.join(', '));
    },
  }],
  build: {
    outDir: output,
    emptyOutDir: false,
    sourcemap: false,
    lib: { entry: resolve(fixture, 'main.tsx'), name: 'DecemberEventPreview', formats: ['iife'], fileName: () => 'preview.js' },
  },
});

execFileSync(process.execPath, [
  resolve(root, 'node_modules/tailwindcss/lib/cli.js'),
  '-c', resolve(root, 'tailwind.config.ts'),
  '-i', resolve(root, 'app/globals.css'),
  '--content', './components/attendance/*.tsx,./components/admin/AdminStatusBadge.tsx,./components/checkout/EventCheckoutButton.tsx,./preview/december-events/*.tsx',
  '-o', resolve(output, 'preview.css'),
  '--minify',
], { cwd: root, stdio: 'inherit' });

// Reuse locally built Latin font assets if available. No font fetching.
const cssDir = resolve(root, '.next-build/static/css');
const fontRules = [];
for (const filename of await readdir(cssDir).catch(() => [])) {
  if (!filename.endsWith('.css')) continue;
  const css = await readFile(resolve(cssDir, filename), 'utf8');
  for (const [family, name, variable, weight] of [
    ['Bebas Neue', 'preview-display', '--font-bebas', '400'],
    ['Inter', 'preview-sans', '--font-inter', '100 900'],
  ]) {
    if (fontRules.some((rule) => rule.includes(variable))) continue;
    const face = [...css.matchAll(/@font-face\{[^}]+\}/g)].find(([rule]) =>
      rule.includes(`font-family:${family};`) && rule.includes('-s.p.woff2'));
    const file = face?.[0].match(/\/static\/media\/([a-z0-9.-]+\.woff2)/)?.[1];
    if (!file) continue;
    await copyFile(resolve(root, '.next-build/static/media', file), resolve(output, name + '.woff2'));
    fontRules.push(`@font-face{font-family:${name};font-weight:${weight};font-display:swap;src:url(${name}.woff2) format("woff2")}html{${variable}:${name}}`);
  }
}
const cssPath = resolve(output, 'preview.css');
const fallbackFonts = 'html{--font-bebas:Impact;--font-inter:system-ui}';
await writeFile(cssPath, (await readFile(cssPath, 'utf8')) + fallbackFonts + fontRules.join(''));

const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'";
await writeFile(resolve(output, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Rhyze December Events · Local Simulation</title><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js" defer></script></body></html>`,
);
console.log('Local simulation built at ' + output);
console.log('Serve on loopback: python3 -m http.server 4175 --bind 127.0.0.1 --directory ' + output);
