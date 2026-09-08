import { prisma } from '../lib/db/prisma';
import { getStripe, stripeAccountMode, stripeIsConfigured } from '../lib/payments/stripe';
import { buildStripeCatalogEntry, syncStripeCatalogEntry } from '../lib/payments/catalog-sync';
import { PRIVATE_OG_RHYZE_SLUG } from '../lib/catalog/private-membership';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [{ isPublic: true }, { slug: PRIVATE_OG_RHYZE_SLUG }],
    },
    orderBy: [{ displayOrder: 'asc' }, { priceCents: 'asc' }],
  });
  const entries = products.flatMap((product) => {
    const entry = buildStripeCatalogEntry(product, {
      allowPrivate: product.slug === PRIVATE_OG_RHYZE_SLUG,
    });
    return entry ? [{ id: product.id, name: product.name, entry }] : [];
  });

  if (dryRun) {
    console.log(JSON.stringify({ mode: stripeAccountMode(), products: entries }, null, 2));
    return;
  }
  if (!stripeIsConfigured()) {
    throw new Error('STRIPE_SECRET_KEY is required. Run with --dry-run to preview safely.');
  }

  const stripe = getStripe();
  for (const product of products) {
    const price = await syncStripeCatalogEntry(stripe, product, {
      allowPrivate: product.slug === PRIVATE_OG_RHYZE_SLUG,
    });
    if (!price) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: { stripePriceId: price.id },
    });
    console.log(`${product.name}: ${price.id}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
