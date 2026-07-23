'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/auth';
import {
  AccountConflictError,
  createAccount,
  InvalidPasswordError,
} from '@/lib/domain/accounts/account-service';
import { prismaAccountRepository } from '@/lib/domain/accounts/prisma-account-repository';
import { signInSchema, signUpSchema } from '@/lib/validation/auth';

export async function signInAction(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    redirect('/sign-in?error=invalid');
  }

  try {
    await signIn('credentials', {
      ...parsed.data,
      redirectTo: '/member',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect('/sign-in?error=credentials');
    }
    throw error;
  }
}

export async function signUpAction(formData: FormData): Promise<void> {
  const parsed = signUpSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
  });

  if (!parsed.success) {
    redirect('/sign-up?error=invalid');
  }

  try {
    await createAccount(parsed.data, prismaAccountRepository);
  } catch (error) {
    if (error instanceof AccountConflictError) {
      redirect('/sign-up?error=exists');
    }
    if (error instanceof InvalidPasswordError) {
      redirect('/sign-up?error=password');
    }
    throw error;
  }

  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: '/member/waiver',
  });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
