// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { CancelIntroTrialForm } from '@/components/admin/CancelIntroTrialForm';
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
it('keeps ordinary checkout and assignment available even with legacy trial-preview props', () => {
  const legacyProps = {
    trialUpgrade: (
      <section aria-label="Trial to paid membership">Unfinished offer</section>
    ),
  };
  const view = render(
    <AdminMembershipStartForm
      userId="synthetic"
      products={products}
      checkoutAction={() => {}}
      assignmentAction={() => {}}
      minimumEndDate="2026-11-08"
      {...legacyProps}
    />,
  );
  expect(
    (
      view.getByRole('button', {
        name: 'Continue to secure checkout',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(view.getByRole('button', { name: 'Assign membership' })).toBeTruthy();
  expect(
    view.queryByRole('region', { name: 'Trial to paid membership' }),
  ).toBeNull();
});
it('keeps the standard paid purchase form visible and usable after trial history', async () => {
  const checkoutAction = vi.fn(async (_form: FormData) => {});
  const assignmentAction = vi.fn();
  // Exercise the removed restriction even if a caller still supplies its old prop.
  const legacyProps = { hasIntroTrialHistory: true };
  const view = render(<AdminMembershipStartForm userId="synthetic" products={products}
    checkoutAction={checkoutAction} assignmentAction={assignmentAction} minimumEndDate="2026-11-08"
    {...legacyProps} />);
  const button = view.getByRole('button', { name: 'Continue to secure checkout' }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  expect(view.queryByRole('alert')).toBeNull();
  const purchaseForm = within(button.closest('form')!);
  expect(purchaseForm.getByRole('heading', { name: 'PURCHASE THROUGH STRIPE' })).toBeTruthy();
  expect(purchaseForm.getByText('Card details stay on Stripe. Access starts only after Stripe confirms payment.')).toBeTruthy();
  expect(purchaseForm.getByText('Review the amount on Stripe before paying. Creating checkout does not grant access or charge the card.')).toBeTruthy();
  fireEvent.change(purchaseForm.getByRole('combobox', { name: 'Membership plan' }), {
    target: { value: 'elevate' },
  });
  fireEvent.click(button);
  await waitFor(() => expect(checkoutAction).toHaveBeenCalledOnce());
  expect(Object.fromEntries(checkoutAction.mock.calls[0][0])).toEqual({
    userId: 'synthetic', productId: 'elevate',
  });
  expect(view.getByRole('button', { name: 'Assign membership' })).toBeTruthy();
  expect(assignmentAction).not.toHaveBeenCalled();
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
    'All past bookings and attendance are preserved.',
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

it('disables cancellation for ambiguous funding or pending freezes even after confirmation', () => {
  const action = vi.fn();
  const view = render(
    <CancelIntroTrialForm
      userId="synthetic"
      membershipId="trial"
      action={action}
      blocker="Ambiguous funding or a pending freeze needs review."
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

it('submits only the selected trial identity, confirmation and reason', async () => {
  const action = vi.fn(async (_form: FormData) => {});
  const view = render(
    <CancelIntroTrialForm
      userId="synthetic"
      membershipId="trial"
      action={action}
    />,
  );
  fireEvent.change(view.getByLabelText('Cancellation reason'), {
    target: { value: 'Requested cancellation' },
  });
  const button = view.getByRole('button', {
    name: 'Cancel trial',
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.click(button);
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(Object.fromEntries(action.mock.calls[0][0])).toEqual({
    userId: 'synthetic',
    membershipId: 'trial',
    confirmed: 'on',
    reason: 'Requested cancellation',
  });
});
