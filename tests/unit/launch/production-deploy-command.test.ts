import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production Netlify deployment', () => {
  it('always runs the complete production build pipeline before publishing', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const command = packageJson.scripts?.['deploy:production'];

    expect(command).toBe('npx netlify deploy --prod --context production');
    expect(command).not.toContain('--no-build');
  });
});
