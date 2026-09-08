import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { PRIVATE_OG_RHYZE_SLUG } from '@/lib/catalog/private-membership';
import { prisma } from '@/lib/db/prisma';
import { buildStripeCatalogEntry, syncStripeCatalogEntry } from '@/lib/payments/catalog-sync';
import { getStripe, stripeAccountMode, stripeIsConfigured } from '@/lib/payments/stripe';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  if (
    !process.env.JOB_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [{ isPublic: true }, { slug: PRIVATE_OG_RHYZE_SLUG }],
    },
    orderBy: [{ displayOrder: 'asc' }, { priceCents: 'asc' }],
  });

  const catalogPreview = products.flatMap((product) => {
    const entry = buildStripeCatalogEntry(product, {
      allowPrivate: product.slug === PRIVATE_OG_RHYZE_SLUG,
    });
    return entry
      ? [{ productId: product.id, slug: product.slug, lookupKey: entry.price.lookup_key }]
      : [];
  });

  if (!stripeIsConfigured()) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY is required.', mode: stripeAccountMode(), catalogPreview },
      { status: 500 },
    );
  }

  const stripe = getStripe();
  const synced = [];
  for (const product of products) {
    const price = await syncStripeCatalogEntry(stripe, product, {
      allowPrivate: product.slug === PRIVATE_OG_RHYZE_SLUG,
    });
    if (!price) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: { stripePriceId: price.id },
    });
    synced.push({
      productId: product.id,
      slug: product.slug,
      stripePriceId: price.id,
      lookupKey: price.lookup_key,
      recurring: price.recurring,
      unitAmount: price.unit_amount,
    });
  }

  const verifiedProducts = await prisma.product.findMany({
    where: { slug: { in: ['vip-access-pass', 'eight-class-pack'] } },
    select: {
      id: true,
      name: true,
      slug: true,
      priceCents: true,
      billingInterval: true,
      includedCredits: true,
      customPlanType: true,
      stripePriceId: true,
      isActive: true,
      isPublic: true,
      availabilityStart: true,
    },
    orderBy: { slug: 'asc' },
  });

  revalidatePath('/memberships');
  revalidatePath('/pricing');
  revalidatePath('/join');
  revalidatePath('/member/membership');

  return NextResponse.json({
    mode: stripeAccountMode(),
    synced,
    verifiedProducts,
  });
}
