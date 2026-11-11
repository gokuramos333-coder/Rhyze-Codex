// Read-only check of the generated static artifact. No application server.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, '../cancel-trial-owner-preview');
const html = await readFile(resolve(output, 'index.html'), 'utf8');
const javascript = await readFile(resolve(output, 'preview.js'), 'utf8');
const dom = new JSDOM(html, {
  url: 'https://synthetic-preview.invalid/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
// No resource loader: the generated bundle is evaluated locally, without requests.
try {
  dom.window.eval(javascript);
  await new Promise((r) => setTimeout(r, 100));
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll('select, input[type="email"]').length, 0);
  assert.equal(
    [...doc.querySelectorAll('button')].some((b) =>
      /checkout|email/i.test(b.textContent),
    ),
    false,
  );
  assert.match(doc.body.textContent, /NONPRODUCTION.*SYNTHETIC PREVIEW/);
  assert.match(
    doc.body.textContent,
    /Paused 7-day intro trial with proven past booking funding/,
  );
  assert.match(
    doc.body.textContent,
    /All past bookings and attendance are preserved/,
  );
  const forms = [...doc.querySelectorAll('form')];
  assert.equal(forms.length, 3);
  let blocked = 0;
  for (const form of forms) {
    const button = form.querySelector('button');
    assert.equal(button.textContent, 'Cancel trial');
    assert(button.disabled);
    const reason = form.querySelector('input[name="reason"]');
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    ).set.call(reason, 'Synthetic review');
    reason.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    form.querySelector('input[type="checkbox"]').click();
    await new Promise((r) => setTimeout(r, 50));
    const alert = form.querySelector('[role="alert"]');
    assert.equal(button.disabled, Boolean(alert));
    if (alert) {
      blocked += 1;
      assert.match(alert.textContent, /Ambiguous funding|future|in-progress/);
    }
    const submit = new dom.window.Event('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(submit);
    assert(submit.defaultPrevented);
  }
  assert.equal(blocked, 1);
  assert.match(
    doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
    /connect-src 'none'; form-action 'none'/,
  );
  const result = {
    generatedBundleExecuted: true,
    cancellationOnly: true,
    eligibleScenarios: 2,
    reviewBlockedScenarios: 1,
    submitsPrevented: true,
    synthetic: true,
    networkRequests: 0,
    note: 'JSDOM functional artifact check; not a visual/browser layout verification.',
  };
  await writeFile(
    resolve(root, '../evidence/cancel-trial-preview-functional.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  dom.window.close();
}
