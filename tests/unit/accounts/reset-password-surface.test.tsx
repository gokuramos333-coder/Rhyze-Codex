// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResetPasswordForm } from '@/components/domain/accounts/ResetPasswordForm';

describe('password reset form', () => {
  it('shows both password visibility controls and the current password rule', () => {
    render(<ResetPasswordForm token="reset-token" />);

    expect(screen.getByDisplayValue('reset-token')).toHaveAttribute('name', 'token');
    expect(screen.getByRole('button', { name: 'Show new password' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Show confirm new password' }),
    ).toBeVisible();
    expect(screen.getByText(/at least 9 characters/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeVisible();
  });
});
