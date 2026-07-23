import { describe, expect, it } from 'vitest';
import { hasAcceptedRequiredWaiver } from '@/lib/domain/waivers/waiver-service';

describe('waiver eligibility', () => {
  it('requires acceptance of the currently active required version', () => {
    expect(
      hasAcceptedRequiredWaiver(
        { id: 'waiver-v2', requiresSign: true },
        [{ waiverVersionId: 'waiver-v1' }],
      ),
    ).toBe(false);
    expect(
      hasAcceptedRequiredWaiver(
        { id: 'waiver-v2', requiresSign: true },
        [{ waiverVersionId: 'waiver-v2' }],
      ),
    ).toBe(true);
  });

  it('allows booking when the active policy does not require a signature', () => {
    expect(
      hasAcceptedRequiredWaiver(
        { id: 'information-only', requiresSign: false },
        [],
      ),
    ).toBe(true);
  });

  it('blocks booking when the studio has not published an active waiver', () => {
    expect(hasAcceptedRequiredWaiver(null, [])).toBe(false);
  });
});
