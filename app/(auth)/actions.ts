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
import {
  requestPasswordReset,
  resetPassword,
} from '@/lib/domain/accounts/password-reset-service';
import { prismaPasswordResetRepository } from '@/lib/domain/accounts/prisma-password-reset-repository';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth';

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

export async function forgotPasswordAction(formData: FormData): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) redirect('/forgot-password?error=invalid');

  const token = await requestPasswordReset(
    parsed.data.email,
    prismaPasswordResetRepository,
  );

  if (process.env.NODE_ENV !== 'production' && token) {
    redirect(`/reset-password/${token}`);
  }

  redirect('/forgot-password?sent=1');
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
  });
  if (!parsed.success) {
    redirect(
      `/reset-password/${String(formData.get('token') || '')}?error=password`,
    );
  }

  try {
    await resetPassword(
      parsed.data.token,
      parsed.data.password,
      prismaPasswordResetRepository,
    );
  } catch {
    redirect(`/reset-password/${parsed.data.token}?error=token`);
  }

  redirect('/sign-in?reset=1');
}
