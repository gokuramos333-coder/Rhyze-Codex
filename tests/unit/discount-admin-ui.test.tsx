// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { DiscountCampaignForm } from '@/components/admin/DiscountCampaignForm';
import { DiscountCampaignToggle } from '@/components/admin/DiscountCampaignToggle';

afterEach(cleanup);

it('wires the inline-error toggle instead of a raw server-action form', () => {
  const source = readFileSync('app/(studio)/admin/discounts/page.tsx', 'utf8');
  expect(source).toContain('<DiscountCampaignToggle id={c.id} enabled={c.enabled} action={setDiscountCampaignEnabledAction} />');
  expect(source).not.toContain('<form action={setDiscountCampaignEnabledAction}>');
});

it('renders the time-aware campaign status rather than enabled as active', () => {
  const source = readFileSync('app/(studio)/admin/discounts/page.tsx', 'utf8');
  expect(source).toContain('{campaignStatus(c)}');
  expect(source).not.toContain('Enabled (within redemption window)');
});

it('shows creation errors inline and permits a retry', async () => {
  const action = vi.fn().mockResolvedValue({ error: 'Synthetic creation rejection' });
  const { container } = render(<DiscountCampaignForm products={[]} action={action} />);
  fireEvent.submit(container.querySelector('form')!);
  expect((await screen.findByRole('alert')).textContent).toBe('Synthetic creation rejection');
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
});

it('submits the requested toggle and shows its error inline', async () => {
  const action = vi.fn().mockResolvedValue({ error: 'Synthetic update rejection' });
  const { container } = render(<DiscountCampaignToggle id="synthetic" enabled={true} action={action} />);
  fireEvent.submit(container.querySelector('form')!);
  expect((await screen.findByRole('alert')).textContent).toBe('Synthetic update rejection');
  const data = action.mock.calls[0][0] as FormData;
  expect(data.get('id')).toBe('synthetic');
  expect(data.get('enabled')).toBe('false');
  expect((screen.getByRole('button', { name: 'Disable new checkouts' }) as HTMLButtonElement).disabled).toBe(false);
});
