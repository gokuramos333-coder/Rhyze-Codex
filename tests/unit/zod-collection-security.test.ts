import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { audienceSchema, documentSchema } from '@/lib/newsletters/domain';
import { copyOverrideSchema } from '@/lib/notifications/email-template-overrides';

describe('GHSA-mrhx-c7xc-m3w5 constrained collection rejection', () => {
  it('rejects oversized arrays before validating their elements', () => {
    let visited = 0;
    const schema = z.array(z.string().refine(() => { visited++; return true; })).max(2);
    expect(schema.safeParse(['a', 'b', 'c']).success).toBe(false);
    expect(visited).toBe(0);
  });

  it.each([
    ['newsletter blocks', documentSchema, { version: 1, blocks: Array(41).fill(null) }, 'blocks'],
    ['audience groups', audienceSchema, { groups: Array(16).fill(null) }, 'groups'],
    ['email paragraphs', copyOverrideSchema, { paragraphs: Array(9).fill(null) }, 'paragraphs'],
  ] as const)('bounds issue allocation for %s', (_name, schema, input, field) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Oversized collection accepted');
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({ code: 'too_big', path: [field] });
  });

  it('preserves valid collection defaults and rejects malformed in-bound elements', () => {
    expect(documentSchema.parse({ version: 1, blocks: [{ id: 'one', type: 'text' }] }).blocks[0].fontSize).toBe(16);
    expect(audienceSchema.parse({ groups: ['ALL'] }).days).toBe(30);
    expect(copyOverrideSchema.parse({ paragraphs: [' hello '] }).paragraphs).toEqual(['hello']);
    expect(documentSchema.safeParse({ version: 1, blocks: [null] }).success).toBe(false);
    expect(audienceSchema.safeParse({ groups: ['UNKNOWN'] }).success).toBe(false);
    expect(copyOverrideSchema.safeParse({ paragraphs: [''] }).success).toBe(false);
  });
});
