import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('home hero header clearance', () => {
  it('keeps hero content below the fixed desktop logo', () => {
    const source = readFileSync('components/sections/Hero.tsx', 'utf8');

    expect(source).toContain('pt-44');
  });
});
