'use server';

import type { BillingInterval, ProductKind } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { redirect } from 'next/navigation';

const kinds = new Set<ProductKind>(['INTRO_TRIAL', 'MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'CLASS_PACK', 'DROP_IN', 'VIP']);
const intervals = new Set<BillingInterval>(['ONE_TIME', 'MONTHLY', 'YEARLY']);
const optionalDate = (value: FormDataEntryValue | null) => {
  const text = String(value || '');
  if (!text) return null;
  const date = new Date(`${text}T00:00:00-04:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

function catalogAvailability(formData: FormData) {
  const alwaysAvailable = formData.get('alwaysAvailable') === 'on';
  return {
    alwaysAvailable,
    availabilityStart: alwaysAvailable ? null : optionalDate(formData.get('availabilityStart')),
    availabilityEnd: alwaysAvailable ? null : optionalDate(formData.get('availabilityEnd')),
  };
}

function revalidateCatalog() {
  revalidatePath('/admin/products');
  revalidatePath('/admin/offerings');
  revalidatePath('/');
  revalidatePath('/join');
  revalidatePath('/member/membership');
  revalidatePath('/memberships');
}

function planType(formData: FormData) {
  const selected = String(formData.get('kind') || '');
  const customPlanType = String(formData.get('customPlanType') || '').trim();
  if (selected === 'CUSTOM') {
    return customPlanType
      ? { kind: 'CLASS_PACK' as ProductKind, customPlanType }
      : null;
  }
  const kind = selected as ProductKind;
  return kinds.has(kind) ? { kind, customPlanType: null } : null;
}

export async function createProductAction(formData: FormData) {
  await requireArea('admin');
  const name = String(formData.get('name') || '').trim();
  const type = planType(formData);
  const billingInterval = String(formData.get('billingInterval') || '') as BillingInterval;
  const priceCents = Math.round(Number(formData.get('price') || 0) * 100);
  if (!name || !type || !intervals.has(billingInterval) || priceCents < 0) return;
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const lastOrder = await prisma.product.aggregate({ _max: { displayOrder: true } });
  await prisma.product.create({
    data: {
      name,
      slug: `${baseSlug}-${Date.now().toString(36)}`,
      description: String(formData.get('description') || '').trim() || name,
      kind: type.kind,
      customPlanType: type.customPlanType,
      priceCents,
      billingInterval,
      includedCredits: formData.get('credits') ? Number(formData.get('credits')) : null,
      isUnlimited: formData.get('isUnlimited') === 'on',
      eligibleCategoryIds: [],
      isPublic: formData.get('isPublic') === 'on',
      displayOrder: (lastOrder._max.displayOrder ?? -1) + 1,
      ...catalogAvailability(formData),
    },
  });
  revalidateCatalog();
  redirect('/admin/products?saved=created');
}

export async function toggleProductAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return;
  await prisma.product.update({ where: { id }, data: { isActive: !product.isActive } });
  revalidateCatalog();
}

export async function updateProductAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const name = String(formData.get('name') || '').trim();
  const type = planType(formData);
  const billingInterval = String(formData.get('billingInterval') || '') as BillingInterval;
  const priceCents = Math.round(Number(formData.get('price') || 0) * 100);
  if (!id || !name || !type || !intervals.has(billingInterval) || priceCents < 0) {
    redirect(`/admin/products/${id}?error=invalid`);
  }
  await prisma.product.update({
    where: { id },
    data: {
      name,
      description: String(formData.get('description') || '').trim() || name,
      kind: type.kind,
      customPlanType: type.customPlanType,
      priceCents,
      billingInterval,
      includedCredits: formData.get('credits') ? Number(formData.get('credits')) : null,
      trialDays: formData.get('trialDays') ? Number(formData.get('trialDays')) : null,
      cancellationPolicy: String(formData.get('cancellationPolicy') || '').trim() || null,
      isUnlimited: formData.get('isUnlimited') === 'on',
      isPublic: formData.get('isPublic') === 'on',
      isActive: formData.get('isActive') === 'on',
      ...catalogAvailability(formData),
    },
  });
  revalidateCatalog();
  redirect(`/admin/products/${id}?saved=1`);
}

export async function saveProductOrderAction(formData: FormData) {
  await requireArea('admin');
  const ids = String(formData.get('orderedIds') || '').split(',').filter(Boolean);
  await prisma.$transaction(
    ids.map((id, displayOrder) =>
      prisma.product.updateMany({ where: { id }, data: { displayOrder } }),
    ),
  );
  revalidateCatalog();
}

export async function deleteProductAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { purchases: true, memberships: true } } },
  });
  if (!product) return;
  if (product._count.purchases || product._count.memberships) {
    await prisma.product.update({ where: { id }, data: { isActive: false, isPublic: false } });
    revalidateCatalog();
    redirect('/admin/products?error=history');
  }
  await prisma.product.delete({ where: { id } });
  revalidateCatalog();
  redirect('/admin/products?saved=deleted');
}
