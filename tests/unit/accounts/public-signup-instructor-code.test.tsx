// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignUpForm } from '@/components/domain/accounts/SignUpForm';

vi.mock('@/app/(auth)/actions', () => ({ signUpAction: vi.fn() }));
(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe('public member signup', () => {
  it('does not offer instructor-code entry to ordinary members', () => {
    render(<SignUpForm />);

    expect(screen.queryByText(/rhyze instructor/i)).toBeNull();
    expect(screen.queryByRole('textbox', { name: /instructor/i })).toBeNull();
  });
});
