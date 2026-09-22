// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountIdentityForm } from '@/components/domain/accounts/AccountIdentityForm';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import { isJwtIdentityStale } from '@/lib/auth/session-config';

afterEach(cleanup);
describe('identity editing surfaces', () => {
  it('offers independent account name and email forms, with reauthentication for self', () => {
    render(<AccountIdentityForm name="Real Name" email="old@example.com" />);
    expect(screen.getByLabelText('Account name')).toHaveValue('Real Name');
    expect(screen.getByLabelText('New email address')).toHaveAttribute(
      'type',
      'email',
    );
    expect(screen.getByLabelText('Current password')).toBeRequired();
    expect(
      screen.getByRole('button', { name: 'Save account name' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Send confirmation' }),
    ).toBeVisible();
    expect(screen.getByText(/old@example.com/)).toBeVisible();
    expect(screen.queryByLabelText(/birthday/i)).toBeNull();
  });
  it('does not solicit a client password in authorized staff editing', () => {
    render(
      <AccountIdentityForm
        name="Member Name"
        email="old@example.com"
        reauthenticate={false}
        userId="member"
      />,
    );
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(screen.getByLabelText('New email address')).toBeVisible();
  });
  it('confirmation email explains old login retention and points only to the verification route', () => {
    const email = renderTransactionalEmail({
      template: 'ACCOUNT_EMAIL_CONFIRMATION',
      subject: 'Confirm email',
      payload: { name: 'Member', confirmUrl: '/confirm-email/secure-token' },
    });
    expect(email.text).toContain('/confirm-email/secure-token');
    expect(email.text).toMatch(/one hour/i);
    expect(email.text).toMatch(/old email/i);
  });
  it('old-address notice gives a support path without exposing the new email or bearer token', () => {
    const email = renderTransactionalEmail({
      template: 'ACCOUNT_EMAIL_CHANGED',
      subject: 'Email changed',
      payload: {
        name: 'Member',
        contactUrl: '/contact',
        newEmail: 'private@example.com',
        token: 'private-token',
      },
    });
    expect(email.text).toContain('/contact');
    expect(email.text).toMatch(/did not/i);
    expect(email.text).not.toContain('private@example.com');
    expect(email.text).not.toContain('private-token');
  });
  it('revokes an old-login JWT even when confirmation occurs within its issuance second', () => {
    expect(
      isJwtIdentityStale(100, 'old@example.com', {
        email: 'new@example.com',
        credentialsUpdatedAt: new Date(100_999),
      }),
    ).toBe(true);
    expect(
      isJwtIdentityStale(101, 'new@example.com', {
        email: 'new@example.com',
        credentialsUpdatedAt: new Date(100_999),
      }),
    ).toBe(false);
  });
});
