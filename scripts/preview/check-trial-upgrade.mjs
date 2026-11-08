// Read-only check of the generated allowlisted artifact. No application server.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, '../owner-preview');
const html = await readFile(resolve(output, 'index.html'), 'utf8');
const javascript = await readFile(resolve(output, 'preview.js'), 'utf8');
const dom = new JSDOM(html, {
  url: 'https://synthetic-preview.invalid/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
// No resource loader: the generated bundle is evaluated locally, without requests.
dom.window.eval(javascript);
await new Promise((r) => setTimeout(r, 100));
const doc = dom.window.document;
const plan = doc.querySelector('[aria-label="Paid plan"]');
assert(plan);
plan.value = 'synthetic-elevate';
plan.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await new Promise((r) => setTimeout(r, 50));
const input = [...doc.querySelectorAll('label')]
  .find((label) => label.textContent.includes('First period amount ($)'))
  .querySelector('input');
Object.getOwnPropertyDescriptor(
  dom.window.HTMLInputElement.prototype,
  'value',
).set.call(input, '78');
input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 50));
assert.match(
  doc.querySelector('[role="status"]').textContent,
  /\$78\.00 first period; \$92\.00\/month from month 2 onward/,
);
for (const label of ['Create checkout', 'Email checkout'])
  assert(
    [...doc.querySelectorAll('button')].find(
      (button) => button.textContent === label,
    )?.disabled,
  );
assert.match(doc.body.textContent, /NONPRODUCTION.*SYNTHETIC PREVIEW/);
assert.match(doc.body.textContent, /Trials with trial or ambiguous booking history cannot be cancelled here/);
const blockedForm = [...doc.querySelectorAll('form')].find((form) => form.querySelector('[role="alert"]'));
assert(blockedForm?.querySelector('button')?.disabled);
assert.match(blockedForm.textContent, /no bookings will be removed/);
assert.match(
  doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
  /connect-src 'none'; form-action 'none'/,
);
const result = {
  generatedBundleExecuted: true,
  exactFirstPeriod: '$78.00',
  recurring: '$92.00',
  checkoutDisabled: true,
  emailDisabled: true,
  bookedTrialCancellationDisabled: true,
  synthetic: true,
  networkRequests: 0,
  note: 'JSDOM functional artifact check; not a visual/browser layout verification.',
};
await writeFile(
  resolve(root, '../evidence/preview-functional.json'),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
dom.window.close();
