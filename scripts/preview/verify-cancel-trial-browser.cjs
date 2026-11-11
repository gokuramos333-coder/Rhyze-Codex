const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const url = new URL(process.env.PREVIEW_URL || 'http://127.0.0.1:52491');
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  ) {
    throw Error('Use a loopback static preview URL.');
  }
  const evidence = path.resolve(__dirname, '../../../evidence');
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [1440, 768, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 } });
      await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === url.origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(url.href);
      await page
        .getByRole('button', { name: 'Cancel trial', exact: true })
        .first()
        .waitFor();
      const result = await page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        synthetic: document.body.innerText.includes('NONPRODUCTION'),
        cancellationButtons: [...document.querySelectorAll('button')].filter(
          (b) => b.textContent === 'Cancel trial',
        ).length,
        cancellationInitiallyDisabled: [
          ...document.querySelectorAll('button'),
        ].every((b) => b.disabled),
        offerControls: document.querySelectorAll('select, input[type="email"]')
          .length,
        checkoutButtons: [...document.querySelectorAll('button')].filter((b) =>
          /checkout|email/i.test(b.textContent),
        ).length,
      }));
      if (
        result.documentWidth > width ||
        !result.synthetic ||
        result.cancellationButtons !== 3 ||
        !result.cancellationInitiallyDisabled ||
        result.offerControls ||
        result.checkoutButtons
      ) {
        throw Error(JSON.stringify(result));
      }
      await page.screenshot({
        path: path.join(evidence, `cancel-trial-preview-${width}.png`),
        fullPage: true,
      });
      results.push(result);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    path.join(evidence, 'cancel-trial-browser-verification.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
