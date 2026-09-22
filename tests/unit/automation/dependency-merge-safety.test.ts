import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const prismaRequire = createRequire(require.resolve('@prisma/config'));
const { deepmerge } = prismaRequire('deepmerge-ts') as { deepmerge: (...values: unknown[]) => unknown };

describe('Prisma config merge dependency safety', () => {
  it('handles recursive graphs without exhausting the stack', () => {
    const left: { self?: unknown } = {}; left.self = left;
    const right: { self?: unknown } = {}; right.self = right;
    expect(() => deepmerge(left, right)).not.toThrow();
  });
  it('preserves ordinary Prisma-style nested configuration merging', () => {
    expect(deepmerge({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' } },
      { migrations: { seed: 'tsx prisma/seed.ts' } })).toEqual({
      schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
    });
  });
});
