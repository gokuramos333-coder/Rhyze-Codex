// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteManualCreditForm } from '@/components/admin/DeleteManualCreditForm';

describe('DeleteManualCreditForm', () => {
  afterEach(() => cleanup());

  it('shows the exact unused grant and requires destructive confirmation', () => {
    const action = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <DeleteManualCreditForm
        action={action}
        userId="user_jolie"
        creditAccountId="credit_test_three"
        label="Class credit — Manual admin grant — expires 2026-08-22"
      />,
    );

    const button = screen.getByRole('button', { name: 'Delete credit' });
    const form = button.closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveFormValues({
      userId: 'user_jolie',
      creditAccountId: 'credit_test_three',
    });

    fireEvent.submit(form!);

    expect(confirm).toHaveBeenCalledWith(
      'Delete “Class credit — Manual admin grant — expires 2026-08-22”? This cannot be undone.',
    );
    expect(action).not.toHaveBeenCalled();
  });
});
