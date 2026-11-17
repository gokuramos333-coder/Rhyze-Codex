import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const {
  build,
} = require('../node_modules/tsx/node_modules/esbuild/lib/main.js');
const out = resolve('../evidence/public-refund-preview');
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ['preview/refund-review/main.tsx'],
  bundle: true,
  write: true,
  outfile: out + '/preview.js',
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
}).then((result) => {
  const forbidden = Object.keys(result.metafile.inputs).filter((path) =>
    /lib\/payments|lib\/db|stripe|auth\.ts/.test(path),
  );
  if (forbidden.length)
    throw Error('Server dependency in public bundle: ' + forbidden.join(','));
});
writeFileSync(
  out + '/preview.css',
  `*{box-sizing:border-box}body{margin:0;background:#f7f5f0;color:#222;font:16px/1.5 system-ui,sans-serif}.review-queue{max-width:900px;margin:auto;padding:32px 20px}aside{padding:16px;background:#fff2cc;border:2px solid #8a5300}h1{font-size:36px;margin-bottom:12px}article{border:1px solid #bbb;background:white;padding:24px;margin:24px 0}header{font-size:21px}label{display:block;font-weight:600}input{display:block;width:100%;padding:12px;font:inherit;margin:8px 0 16px;border:1px solid #777}button{font:inherit;font-weight:700;background:#222;color:white;border:0;padding:14px 18px;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}:focus-visible{outline:3px solid #b64715;outline-offset:4px}[role=status]{min-height:24px}@media(max-width:480px){.review-queue{padding:16px}article{padding:16px}h1{font-size:28px}}`,
);
writeFileSync(
  out + '/index.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"><title>Rhyze financial review — simulation</title><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js" defer></script></body></html>`,
);
writeFileSync(
  out + '/_headers',
  `/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n`,
);
console.log(
  'Public allowlist directory: ' +
    out +
    '\nOnly index.html, preview.js, preview.css, _headers. No hosting performed.',
);
