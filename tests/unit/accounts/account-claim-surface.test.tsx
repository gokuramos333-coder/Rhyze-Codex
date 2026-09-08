// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClaimAccountForm } from '@/components/domain/accounts/ClaimAccountForm';

describe('imported account activation form', () => {
  it('collects a matching password with accessible show controls and the current policy', () => {
    render(<ClaimAccountForm token="secure-claim-token" />);

    expect(screen.getByDisplayValue('secure-claim-token')).toHaveAttribute(
      'name',
      'token',
    );
    expect(screen.getByLabelText(/^New password/, { selector: 'input' })).toHaveAttribute(
      'type',
      'password',
    );
    expect(
      screen.getByLabelText(/^Confirm new password/, { selector: 'input' }),
    ).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Birthday month')).toBeRequired();
    expect(screen.getByLabelText('Birthday day')).toBeRequired();
    expect(screen.queryByLabelText(/birthday year/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Show new password' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Show confirm new password' }),
    ).toBeVisible();
    expect(screen.getByText(/at least 9 characters/i)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /studio policies and waiver/i })).toBeRequired();
    expect(screen.getByRole('link', { name: /studio policies and waiver/i })).toHaveAttribute(
      'href',
      '/policies',
    );
    expect(screen.getByText(/Cancellation policy/i)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /photos\/videos/i })).toHaveAttribute(
      'name',
      'mediaConsent',
    );
    expect(
      screen.getByRole('button', { name: 'Activate my Rhyze account' }),
    ).toBeVisible();
  });
});
