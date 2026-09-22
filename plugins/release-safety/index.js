const { execFileSync } = require('node:child_process');
const { readFileSync, realpathSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { verifyBoundary } = require('../../scripts/release/boundary.cjs');

function guard({ constants }, final) {
  if (process.env.CONTEXT !== 'production') return;
  try {
    if (
      !constants.IS_LOCAL ||
      !process.env.RHYZE_RELEASE_MANIFEST ||
      !process.env.RHYZE_RELEASE_NETLIFY_CLI
    )
      throw Error();
    const manifest = JSON.parse(
      readFileSync(process.env.RHYZE_RELEASE_MANIFEST, 'utf8'),
    );
    if (realpathSync(process.cwd()) !== realpathSync(manifest.root))
      throw Error();
    const api = (operation, data) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            process.env.RHYZE_RELEASE_NETLIFY_CLI,
            'api',
            operation,
            '--data',
            JSON.stringify(data),
          ],
          {
            cwd: manifest.root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 60000,
            maxBuffer: 8 * 1024 * 1024,
          },
        ),
      );
    verifyBoundary(
      manifest,
      { root: dirname(constants.CONFIG_PATH), siteId: constants.SITE_ID },
      api,
    );
    if (final)
      writeFileSync(
        manifest.boundaryReceipt,
        JSON.stringify({
          checkedAt: new Date().toISOString(),
          sourceCommit: manifest.revision,
          expectedDeploy: manifest.expectedDeploy,
          passed: true,
        }),
        { mode: 0o600 },
      );
  } catch {
    throw Error(
      'Rhyze production release guard blocked this build: use the guarded release command and verify snapshot/site/configuration. Sensitive details withheld.',
    );
  }
}

module.exports = {
  onPreBuild: (args) => guard(args, false),
  onPostBuild: (args) => guard(args, true),
};
