const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function environmentFingerprint(variables) {
  // Netlify does not guarantee record/property order. Preserve every field;
  // normalize only object keys and the unordered environment/scopes/values lists.
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
    return value;
  };
  const ordered = (items) => items.map((item) => JSON.stringify(normalize(item))).sort().map((item) => JSON.parse(item));
  return hash(JSON.stringify(ordered(variables.map((variable) => ({
    ...variable,
    ...(variable.scopes ? { scopes: ordered(variable.scopes) } : {}),
    ...(variable.values ? { values: ordered(variable.values) } : {}),
  })))));
}

function assertIsolatedLocation(root) {
  let parent = path.dirname(fs.realpathSync(root));
  for (;;) {
    if (
      fs.existsSync(path.join(parent, 'package.json')) ||
      fs.existsSync(path.join(parent, '.git'))
    )
      throw Error(
        'Release build has a package/git ancestor; use an isolated directory outside the checkout.',
      );
    const next = path.dirname(parent);
    if (next === parent) break;
    parent = next;
  }
}

function verifySnapshot(root, hashes) {
  const expected = new Map(hashes);
  if (!expected.size) throw Error('Source manifest is empty.');
  const found = new Set();
  function walk(dir, prefix = '') {
    for (const name of fs.readdirSync(dir)) {
      const relative = prefix + name;
      const file = path.join(dir, name);
      const info = fs.lstatSync(file);
      if (info.isSymbolicLink())
        throw Error('Release source or generated root is a symbolic link.');
      if (
        !prefix &&
        ['node_modules', '.next', '.next-build', '.netlify'].includes(name)
      ) {
        if (!info.isDirectory())
          throw Error('Generated output root has an unexpected type.');
        continue;
      }
      if (info.isDirectory()) {
        walk(file, relative + '/');
        continue;
      }
      if (!info.isFile()) throw Error('Non-regular source file.');
      if (
        !prefix &&
        ['next-env.d.ts', 'tsconfig.tsbuildinfo'].includes(name) &&
        !expected.has(relative)
      )
        continue;
      if (
        !expected.has(relative) ||
        expected.get(relative) !== hash(fs.readFileSync(file))
      )
        throw Error(`Untested or modified source in snapshot: ${relative}`);
      found.add(relative);
    }
  }
  walk(root);
  if (found.size !== expected.size)
    throw Error('Tracked source file disappeared from snapshot.');
}

function acquireReleaseLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  const owner = JSON.stringify({
    pid: process.pid,
    at: new Date().toISOString(),
    token: crypto.randomUUID(),
  });
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch {
    throw Error(
      'Another release holds the local publication lock. Inspect its process before manually clearing a stale lock; do not bypass it.',
    );
  }
  try {
    fs.writeFileSync(fd, owner);
  } finally {
    fs.closeSync(fd);
  }
  return () => {
    if (fs.readFileSync(lockPath, 'utf8') === owner) fs.unlinkSync(lockPath);
  };
}

function verifyBoundary(manifest, actual, api) {
  if (
    fs.realpathSync(actual.root) !== fs.realpathSync(manifest.root) ||
    actual.siteId !== manifest.siteId
  )
    throw Error(
      'Netlify resolved a different build root/site than the tested source.',
    );
  assertIsolatedLocation(manifest.root);
  verifySnapshot(manifest.root, manifest.hashes);
  const site = api('getSite', { site_id: manifest.siteId });
  if (
    site.id !== manifest.siteId ||
    site.published_deploy?.id !== manifest.expectedDeploy
  )
    throw Error('Production changed during the build. Publication blocked.');
  const config = api('getEnvVars', {
    account_id: manifest.accountId,
    site_id: manifest.siteId,
  });
  if (environmentFingerprint(config) !== manifest.configHash)
    throw Error(
      'Production configuration changed during the build. Publication blocked.',
    );
}

module.exports = {
  environmentFingerprint,
  assertIsolatedLocation,
  verifySnapshot,
  acquireReleaseLock,
  verifyBoundary,
};
