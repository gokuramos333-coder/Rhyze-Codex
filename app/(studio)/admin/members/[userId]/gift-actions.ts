'use server';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import {
  giftCreditInput,
  grantGiftCredit,
} from '@/lib/domain/credits/grant-gift-credit';
export async function grantMemberGiftAction(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  const actor = await requireArea('admin');
  const parsed = giftCreditInput.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      ok: false,
      message:
        'Choose the gift, enter a reason and select a valid expiration date.',
    };
  try {
    await prisma.$transaction((tx) =>
      grantGiftCredit(tx, parsed.data, actor.id),
    );
  } catch {
    return {
      ok: false,
      message:
        'Gift not confirmed. Check the member’s gift history before trying again. Retry this form unchanged to avoid a duplicate.',
    };
  }
  revalidatePath(`/admin/members/${parsed.data.userId}`);
  revalidatePath('/member');
  revalidatePath('/member/membership');
  return {
    ok: true,
    message: 'One gift credit added. No payment or email was created.',
  };
}
