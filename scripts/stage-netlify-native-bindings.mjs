import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const packageName = '@node-rs/argon2-linux-x64-gnu';
const packageVersion = '2.0.2';
const packageDirectory = join(process.cwd(), 'node_modules', '@node-rs', 'argon2-linux-x64-gnu');
const binaryPath = join(packageDirectory, 'argon2.linux-x64-gnu.node');

if (existsSync(binaryPath)) {
  console.log('Netlify Argon2 Linux binding is already available.');
  process.exit(0);
}

const stagingDirectory = mkdtempSync(join(tmpdir(), 'rhyze-netlify-native-'));

try {
  execFileSync(
    'npm',
    ['pack', `${packageName}@${packageVersion}`, '--pack-destination', stagingDirectory],
    { stdio: 'ignore' },
  );

  mkdirSync(packageDirectory, { recursive: true });
  execFileSync(
    'tar',
    [
      '-xzf',
      join(stagingDirectory, `node-rs-argon2-linux-x64-gnu-${packageVersion}.tgz`),
      '-C',
      packageDirectory,
      '--strip-components=1',
    ],
    { stdio: 'inherit' },
  );

  if (!existsSync(binaryPath)) {
    throw new Error(`Expected native binding was not staged at ${binaryPath}.`);
  }

  console.log('Staged the Argon2 Linux binding for the Netlify server function.');
} finally {
  rmSync(stagingDirectory, { recursive: true, force: true });
}
