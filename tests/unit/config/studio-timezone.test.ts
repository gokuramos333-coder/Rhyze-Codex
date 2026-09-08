import { describe, expect, it } from 'vitest';
import { STUDIO_TIME_ZONE } from '@/lib/config/studio';

describe('Rhyze studio timezone', () => {
  it('uses the DST-aware Eastern timezone for every studio date and time', () => {
    expect(STUDIO_TIME_ZONE).toBe('America/New_York');
  });
});
