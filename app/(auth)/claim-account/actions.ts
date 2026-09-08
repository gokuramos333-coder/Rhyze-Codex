'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AgreementRequiredError, InvalidPasswordError } from '@/lib/domain/accounts/account-service';
import { claimImportedAccount } from '@/lib/domain/accounts/account-claim-service';
import { prismaAccountClaimRepository } from '@/lib/domain/accounts/prisma-account-claim-repository';
import { accountClaimSchema } from '@/lib/validation/auth';
import { prisma } from '@/lib/db/prisma';

export async function claimAccountAction(formData: FormData): Promise<void> {
  const parsed = accountClaimSchema.safeParse({
    token: formData.get('token'),
    birthdayMonth: formData.get('birthdayMonth'),
    birthdayDay: formData.get('birthdayDay'),
    waiverAccepted: formData.get('waiverAccepted') === 'on',
    mediaConsent: formData.get('mediaConsent') === 'on',
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
  });
  const token = String(formData.get('token') || '');
  if (formData.get('waiverAccepted') !== 'on') {
    redirect(`/claim-account/${encodeURIComponent(token)}?error=agreement`);
  }
  if (!parsed.success) {
    redirect(`/claim-account/${encodeURIComponent(token)}?error=password`);
  }

  const activeWaiver = await prisma.waiverVersion.findFirst({
    where: { isActive: true, requiresSign: true },
    select: { id: true },
    orderBy: { effectiveAt: 'desc' },
  });
  if (!activeWaiver) {
    redirect(`/claim-account/${encodeURIComponent(token)}?error=agreement`);
  }
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for');

  try {
    await claimImportedAccount(
      parsed.data.token,
      parsed.data.password,
      parsed.data.dateOfBirth,
      parsed.data.waiverAccepted,
      activeWaiver.id,
      prismaAccountClaimRepository,
      parsed.data.mediaConsent,
      {
        ipAddress: forwardedFor?.split(',')[0]?.trim() || null,
        userAgent: requestHeaders.get('user-agent'),
      },
    );
  } catch (error) {
    if (error instanceof InvalidPasswordError) {
      redirect(`/claim-account/${encodeURIComponent(token)}?error=password`);
    }
    if (error instanceof AgreementRequiredError) {
      redirect(`/claim-account/${encodeURIComponent(token)}?error=agreement`);
    }
    redirect(`/claim-account/${encodeURIComponent(token)}?error=token`);
  }

  redirect('/sign-in?claimed=1');
}
