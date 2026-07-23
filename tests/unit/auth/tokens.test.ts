import { describe, expect, it } from 'vitest';
import {
  createSecureToken,
  hashToken,
  isTokenUsable,
} from '@/lib/auth/tokens';

describe('secure account tokens', () => {
  it('stores only a hash that can be compared to the presented token', () => {
    const { token, tokenHash } = createSecureToken();

    expect(token).not.toBe(tokenHash);
    expect(hashToken(token)).toBe(tokenHash);
  });

  it('rejects expired or previously used tokens', () => {
    const now = new Date('2026-07-23T15:00:00.000Z');

    expect(
      isTokenUsable(
        { expiresAt: new Date('2026-07-23T15:01:00.000Z'), usedAt: null },
        now,
      ),
    ).toBe(true);
    expect(
      isTokenUsable(
        { expiresAt: new Date('2026-07-23T14:59:59.000Z'), usedAt: null },
        now,
      ),
    ).toBe(false);
    expect(
      isTokenUsable(
        {
          expiresAt: new Date('2026-07-23T15:01:00.000Z'),
          usedAt: new Date('2026-07-23T14:55:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });
});
