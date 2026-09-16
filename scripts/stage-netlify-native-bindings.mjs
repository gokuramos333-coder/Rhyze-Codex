import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const nativePackages = [
  {
    name: '@node-rs/argon2-linux-x64-gnu',
    version: '2.0.2',
    relativeBinaryPath: 'argon2.linux-x64-gnu.node',
  },
  {
    name: '@img/sharp-linux-x64',
    version: '0.35.4',
    relativeBinaryPath: 'lib/sharp-linux-x64-0.35.4.node',
  },
  {
    name: '@img/sharp-libvips-linux-x64',
    version: '1.3.3',
    relativeBinaryPath: 'lib/libvips-cpp.so.8.18.6',
  },
];

const stagingDirectory = mkdtempSync(join(tmpdir(), 'rhyze-netlify-native-'));

try {
  for (const dependency of nativePackages) {
    const packageDirectory = join(
      process.cwd(),
      'node_modules',
      ...dependency.name.split('/'),
    );
    const binaryPath = join(packageDirectory, dependency.relativeBinaryPath);
    if (existsSync(binaryPath)) {
      console.log(`${dependency.name} is already available for Netlify.`);
      continue;
    }

    const packResult = execFileSync(
      'npm',
      [
        'pack',
        `${dependency.name}@${dependency.version}`,
        '--pack-destination',
        stagingDirectory,
        '--json',
      ],
      { encoding: 'utf8' },
    );
    const [{ filename }] = JSON.parse(packResult);

    mkdirSync(packageDirectory, { recursive: true });
    execFileSync(
      'tar',
      [
        '-xzf',
        join(stagingDirectory, filename),
        '-C',
        packageDirectory,
        '--strip-components=1',
      ],
      { stdio: 'inherit' },
    );

    if (!existsSync(binaryPath)) {
      throw new Error(`Expected native binding was not staged at ${binaryPath}.`);
    }

    console.log(`Staged ${dependency.name} for the Netlify server function.`);
  }
} finally {
  rmSync(stagingDirectory, { recursive: true, force: true });
}
