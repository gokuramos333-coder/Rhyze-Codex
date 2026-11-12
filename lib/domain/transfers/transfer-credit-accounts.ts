import type { Prisma } from '@prisma/client';
import { OWNER_UNLIMITED_PREFIX } from '@/lib/domain/credits/owner-unlimited-access';
import { GIFT_CREDIT_PREFIX } from '@/lib/domain/credits/gift-credit';
export const transferCreditAccountsInclude = {
  where: {
    sourcePurchaseId: null,
    OR: [
      { id: { startsWith: OWNER_UNLIMITED_PREFIX }, isUnlimited: true },
      { id: { startsWith: GIFT_CREDIT_PREFIX }, isUnlimited: false },
    ],
  },
  select: {
    id: true,
    label: true,
    validFrom: true,
    validUntil: true,
    sourcePurchaseId: true,
    isUnlimited: true,
  },
} satisfies Prisma.User$creditAccountsArgs;
