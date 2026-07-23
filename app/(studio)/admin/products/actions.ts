'use server';

import type { BillingInterval, ProductKind } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

const kinds = new Set<ProductKind>(['INTRO_TRIAL', 'MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'CLASS_PACK', 'DROP_IN', 'VIP']);
const intervals = new Set<BillingInterval>(['ONE_TIME', 'MONTHLY', 'YEARLY']);

export async function createProductAction(formData: FormData) {
  await requireArea('admin');
  const name = String(formData.get('name') || '').trim();
  const kind = String(formData.get('kind') || '') as ProductKind;
  const billingInterval = String(formData.get('billingInterval') || '') as BillingInterval;
  const priceCents = Math.round(Number(formData.get('price') || 0) * 100);
  if (!name || !kinds.has(kind) || !intervals.has(billingInterval) || priceCents < 0) return;
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  await prisma.product.create({
    data: {
      name,
      slug: `${baseSlug}-${Date.now().toString(36)}`,
      description: String(formData.get('description') || '').trim() || name,
      kind,
      priceCents,
      billingInterval,
      includedCredits: formData.get('credits') ? Number(formData.get('credits')) : null,
      isUnlimited: formData.get('isUnlimited') === 'on',
      eligibleCategoryIds: [],
      isPublic: formData.get('isPublic') === 'on',
    },
  });
  revalidatePath('/admin/products');
  revalidatePath('/memberships');
}

export async function toggleProductAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return;
  await prisma.product.update({ where: { id }, data: { isActive: !product.isActive } });
  revalidatePath('/admin/products');
  revalidatePath('/memberships');
}
