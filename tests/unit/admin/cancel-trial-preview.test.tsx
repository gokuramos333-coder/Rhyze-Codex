// @vitest-environment jsdom
import { act, fireEvent, within } from '@testing-library/react';
import { expect, it } from 'vitest';

it('previews only cancellation, with eligible history and a separate review blocker', async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => {
    await import('../../fixtures/cancel-trial-preview');
  });
  const view = within(document.getElementById('root')!);
  expect(view.queryAllByRole('combobox')).toHaveLength(0);
  expect(view.queryByRole('button', { name: /checkout|email/i })).toBeNull();
  expect(view.getAllByRole('button', { name: 'Cancel trial' })).toHaveLength(3);
  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    const fields = within(form);
    const button = fields.getByRole('button', {
      name: 'Cancel trial',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(fields.getByLabelText('Cancellation reason'), {
      target: { value: 'Synthetic review' },
    });
    fireEvent.click(fields.getByRole('checkbox'));
    expect(button.disabled).toBe(Boolean(fields.queryByRole('alert')));
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  expect(
    view.getByText(/Paused 7-day intro trial with proven past booking funding/),
  ).toBeTruthy();
  expect(view.getByRole('alert').textContent).toMatch(
    /future.*in-progress|ambiguous/i,
  );
});
