// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import {
  TrialUpgradePanel,
  CancelIntroTrialForm,
} from '@/components/admin/TrialUpgradePanel';
import { AdminMembershipStartForm } from '@/components/admin/AdminMembershipStartForm';
afterEach(cleanup);
const products = [
  {
    id: 'elevate',
    name: 'Elevate',
    kind: 'LIMITED_MEMBERSHIP',
    billingInterval: 'MONTHLY',
    priceCents: 9200,
    stripePriceId: 'price_synthetic',
    isActive: true,
  },
];
it('replaces the ordinary checkout path for trial clients while keeping documented assignments separate', () => {
  const view = render(
    <AdminMembershipStartForm
      userId="synthetic"
      products={products}
      checkoutAction={() => {}}
      assignmentAction={() => {}}
      minimumEndDate="2026-11-08"
      trialUpgrade={
        <TrialUpgradePanel email="synthetic@example.test" products={products} />
      }
    />,
  );
  expect(
    view.queryByRole('button', { name: 'Continue to secure checkout' }),
  ).toBeNull();
  expect(view.getByRole('button', { name: 'Assign membership' })).toBeTruthy();
  expect(
    (view.getByRole('button', { name: 'Create checkout' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it('shows exact first-only terms and never enables checkout or email', () => {
  const view = render(
    <TrialUpgradePanel email="synthetic@example.test" products={products} />,
  );
  fireEvent.change(view.getByLabelText('Paid plan'), {
    target: { value: 'elevate' },
  });
  fireEvent.change(view.getByLabelText('First period amount ($)'), {
    target: { value: '78' },
  });
  expect(view.getByRole('status').textContent).toContain(
    '$78.00 first period; $92.00/month from month 2 onward',
  );
  for (const name of ['Create checkout', 'Email checkout'])
    expect(
      (view.getByRole('button', { name }) as HTMLButtonElement).disabled,
    ).toBe(true);
  expect(view.container.textContent).toContain('14 days');
  expect(view.container.textContent).toContain(
    'Studio cancellation does not extend',
  );
  fireEvent.change(view.getByLabelText('First period pricing'), {
    target: { value: 'percent' },
  });
  fireEvent.change(view.getByLabelText('First period discount (%)'), {
    target: { value: '15' },
  });
  expect(view.getByRole('status').textContent).toContain('$78.20');
});
it('excludes inactive, one-time and unsupported plans', () => {
  const view = render(
    <TrialUpgradePanel
      email="synthetic@example.test"
      products={[
        ...products,
        {
          ...products[0],
          id: 'pack',
          name: 'Pack',
          billingInterval: 'ONE_TIME',
        },
        { ...products[0], id: 'inactive', name: 'Inactive', isActive: false },
      ]}
    />,
  );
  expect(view.queryByRole('option', { name: /Pack|Inactive/ })).toBeNull();
});
it('requires explicit cancellation confirmation and truthfully explains the booking restriction', () => {
  const action = vi.fn();
  const view = render(
    <CancelIntroTrialForm
      userId="synthetic"
      membershipId="trial"
      action={action}
    />,
  );
  expect(
    (view.getByRole('button', { name: 'Cancel trial' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(view.container.textContent).toContain(
    'Trials with trial or ambiguous booking history cannot be cancelled here',
  );
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.change(view.getByLabelText('Cancellation reason'), {
    target: { value: 'Moving to paid membership' },
  });
  expect(
    (view.getByRole('button', { name: 'Cancel trial' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(action).not.toHaveBeenCalled();
});

it('disables cancellation for booking history or pending freezes even after confirmation', () => {
  const action = vi.fn();
  const view = render(
    <CancelIntroTrialForm
      userId="synthetic"
      membershipId="trial"
      action={action}
      blocker="Booking history or a pending freeze needs review."
    />,
  );
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.change(view.getByLabelText('Cancellation reason'), {
    target: { value: 'Moving to paid membership' },
  });
  expect(view.getByRole('alert').textContent).toContain('needs review');
  expect(
    (view.getByRole('button', { name: 'Cancel trial' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(action).not.toHaveBeenCalled();
});
