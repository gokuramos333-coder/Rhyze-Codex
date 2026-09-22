import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('raised-arms brand icons', () => {
  it.each(['app/icon.tsx', 'app/apple-icon.tsx'])('%s uses the isolated symbol, not the old letter R', file => {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('rhyzeSymbolIcon');
    expect(source).not.toMatch(/>\s*R\s*</);
  });
});
