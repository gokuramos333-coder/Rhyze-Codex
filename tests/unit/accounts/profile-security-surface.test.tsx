// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileSecurityForm } from '@/components/domain/accounts/ProfileSecurityForm';

describe('member Profile account security', () => {
  it('shows the account email and secure password-change controls', () => {
    render(<ProfileSecurityForm email="member@example.com" />);

    expect(screen.getByText('member@example.com')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show current password' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show new password' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Show confirm new password' }),
    ).toBeVisible();
    expect(screen.getByText(/remain signed in/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeVisible();
  });
});
