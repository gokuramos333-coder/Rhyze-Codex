// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DiscountCampaignForm } from '@/components/admin/DiscountCampaignForm';
afterEach(cleanup);
it('keeps both native Eastern date/time controls readable on narrow mobile without changing values', () => {
  render(<DiscountCampaignForm products={[]} action={vi.fn()} />);
  for (const label of ['Redemption starts (Eastern)', 'Redemption ends (Eastern, exclusive)']) {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
    expect(input.required).toBe(true);
    expect(input.classList.contains('text-sm')).toBe(true);
    expect(input.classList.contains('sm:text-base')).toBe(true);
  }
});
