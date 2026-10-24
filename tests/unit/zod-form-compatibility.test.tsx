// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContactForm } from '@/components/sections/ContactForm';
import { JoinForm } from '@/components/sections/JoinForm';
import { signUpSchema, accountClaimSchema } from '@/lib/validation/auth';

afterEach(cleanup);

it.each([
  ['contact', ContactForm, 'Please share your name'],
  ['join', JoinForm, 'Please agree to the waiver to continue'],
] as const)('renders %s validation errors without rejecting the resolver promise', async (_name, Form, message) => {
  const { container } = render(<Form />);
  fireEvent.submit(container.querySelector('form')!);
  expect(await screen.findByText(message)).toBeTruthy();
});

it.each([
  [signUpSchema, 'Accept the studio policies and waiver to create an account.'],
  [accountClaimSchema, 'Accept the studio policies and waiver to activate your account.'],
] as const)('retains the specific server waiver error', (schema, message) => {
  const result = schema.safeParse({ waiverAccepted: false });
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Missing waiver accepted');
  expect(result.error.issues.find(issue => issue.path[0] === 'waiverAccepted')?.message).toBe(message);
});
