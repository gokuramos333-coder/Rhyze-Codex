import { describe, expect, it } from 'vitest';
import { chartTooltip } from '@/lib/admin/chart-tooltip';

describe('admin chart tooltip', () => {
  it('formats exact revenue and count values with their labels', () => {
    expect(chartTooltip('Jul 24', 93500, 'money')).toBe('Jul 24: $935.00');
    expect(chartTooltip('Active members', 23, 'count')).toBe('Active members: 23');
  });
});
