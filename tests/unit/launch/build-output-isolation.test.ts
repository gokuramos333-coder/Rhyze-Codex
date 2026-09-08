import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Next.js build output isolation', () => {
  it('keeps production builds out of the live preview cache', () => {
    const config = readFileSync('next.config.mjs', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(config).toContain("distDir: process.env.NEXT_DIST_DIR || '.next'");
    expect(packageJson.scripts.build).toBe('NEXT_DIST_DIR=.next-build next build');
    expect(packageJson.scripts.start).toBe('NEXT_DIST_DIR=.next-build next start');
    expect(gitignore).toContain('.next-build');
  });
});
