import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const outbound = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (!route.request().url().startsWith('file:')) {
      outbound.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(
    pathToFileURL(resolve('../evidence/public-refund-preview/index.html')).href,
  );
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    if (
      !(await page.getByText('SIMULATION — synthetic data only.').isVisible())
    )
      throw Error('Missing simulation banner');
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error('Horizontal overflow');
    await page.screenshot({
      path: resolve(`../evidence/refund-preview-${width}.png`),
      fullPage: true,
    });
  }
  const first = page.locator('article').first();
  for (const identity of ['Alex Example', 'alex@example.test', 'synthetic-member-one', 'synthetic-booking-one', 'synthetic-payment-one', 'synthetic-intent-one', 'Fictional Pilates one']) {
    if (!(await first.getByText(identity, {exact:false}).isVisible())) throw Error('Missing preview identity: '+identity);
  }
  if (await page.locator('a[href]').count()) throw Error('Synthetic preview must have no outbound receipt links');
  await first.locator('input').fill('Synthetic approved attendance correction');
  await first.locator('button').click();
  await first
    .getByText(
      'SIMULATED: exact refund receipt independently verified. Attendance unchanged.',
    )
    .waitFor();
  await first.locator('button').click();
  await first
    .getByText(
      'SIMULATED: existing operation reconciled. No second submission.',
    )
    .waitFor();
  await page
    .getByRole('button', { name: 'Reconcile existing receipt' })
    .click();
  await page
    .getByText(
      'SIMULATED: provider receipt is still pending. Obligation remains open; no retry submitted.',
    )
    .waitFor();
  if (errors.length || outbound.length)
    throw Error(JSON.stringify({ errors, outbound }));
  console.log(
    'PASS: real React component, 390/768/1440 widths, approval, duplicate approval, pending receipt; no outbound requests or page errors.',
  );
} finally {
  await browser.close();
}
