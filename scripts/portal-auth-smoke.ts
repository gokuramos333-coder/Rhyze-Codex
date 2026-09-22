import { execFileSync } from 'node:child_process';
import { chromium, type Page } from 'playwright';
import { verifyPortalAccess } from '../lib/automation/portal-smoke-policy';
import {
  AUTOMATION_TEST_ACCOUNTS,
  type AutomationTestAccount,
} from '../lib/automation/test-accounts';

const baseUrl = (process.env.RHYZE_SMOKE_BASE_URL || 'https://www.rhyzefitness.com')
  .replace(/\/$/, '');

function passwordFor(account: AutomationTestAccount): string {
  try {
    return execFileSync(
      '/usr/bin/security',
      [
        'find-generic-password',
        '-s',
        account.keychainService,
        '-a',
        account.email,
        '-w',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    throw new Error(`Secure credentials are unavailable for the ${account.role} test account.`);
  }
}

function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

async function openExpectedPath(page: Page, path: string) {
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  if (!response || response.status() >= 400) {
    throw new Error(`${path} returned ${response?.status() ?? 'no response'}.`);
  }
  if (pathOf(page) !== path) {
    throw new Error(`${path} redirected unexpectedly to ${pathOf(page)}.`);
  }
  const body = await page.locator('body').innerText();
  if (/application error|internal server error|service unavailable/i.test(body)) {
    throw new Error(`${path} rendered an application error.`);
  }
}

async function authenticate(page: Page, account: AutomationTestAccount) {
  await page.goto(
    `${baseUrl}/sign-in?callbackUrl=${encodeURIComponent(account.expectedPath)}`,
    { waitUntil: 'networkidle' },
  );
  await page.getByLabel('Email address').fill(account.email);
  await page.locator('input[name="password"]').fill(passwordFor(account));
  await page.getByRole('button', { name: 'Enter My Rhyze' }).click();
  await page.waitForURL(
    (url) => url.origin === baseUrl && url.pathname === account.expectedPath,
    { timeout: 30_000 },
  );

  const session = await page.evaluate(async () => {
    const response = await fetch('/api/auth/session');
    return response.json();
  });
  if (
    session?.user?.email !== account.email ||
    session?.user?.role !== account.role ||
    session?.user?.status !== 'ACTIVE'
  ) {
    throw new Error(`${account.role} session identity did not match the test account.`);
  }
}

async function verifyDenied(page: Page, path: string) {
  const response = await page.request.get(`${baseUrl}${path}`, { maxRedirects: 0 });
  if (response.status() < 300 || response.status() >= 400) {
    throw new Error(`${path} permission check returned ${response.status()} instead of a redirect.`);
  }
  const location = response.headers().location;
  if (!location || new URL(location, baseUrl).pathname.startsWith(path)) {
    throw new Error(`${path} did not redirect away from the unauthorized area.`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];

  try {
    for (const account of AUTOMATION_TEST_ACCOUNTS) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const serverErrors: string[] = [];
      page.on('response', (response) => {
        if (response.status() >= 500) {
          serverErrors.push(`${response.status()} ${response.url()}`);
        }
      });

      try {
        await authenticate(page, account);
        await verifyPortalAccess(account.role, {
          open: (path) => openExpectedPath(page, path),
          deny: (path) => verifyDenied(page, path),
        });

        if (serverErrors.length > 0) {
          throw new Error(`Server errors observed: ${serverErrors.join(', ')}`);
        }
        console.info(`${account.role}: PASS`);
      } catch (error) {
        const failure = `${account.role}: FAIL — ${error instanceof Error ? error.message : 'Portal check failed.'}`;
        failures.push(failure);
        console.error(failure);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length) throw new Error(`Authenticated portal smoke failed for ${failures.length} role(s).`);
  console.info(`Authenticated portal smoke check passed for ${baseUrl}.`);
  console.info('Cross-role access checks: PASS');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Authenticated portal smoke check failed.');
  process.exitCode = 1;
});
