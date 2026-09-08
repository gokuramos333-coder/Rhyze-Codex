// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccountAccessNotice } from '@/components/domain/accounts/AccountAccessNotice';

describe('sign-in account access notices', () => {
  it('confirms imported account activation', () => {
    render(<AccountAccessNotice claimed />);

    expect(screen.getByText(/account is activated/i)).toBeVisible();
    expect(screen.getByText(/sign in with the password/i)).toBeVisible();
  });

  it('confirms a completed password reset', () => {
    render(<AccountAccessNotice reset />);

    expect(screen.getByText(/password updated/i)).toBeVisible();
  });
});
