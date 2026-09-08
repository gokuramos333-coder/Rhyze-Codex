import { getStripe } from '@/lib/payments/stripe';
import { buildRhyzePortalConfiguration } from '@/lib/payments/portal-configuration';

async function main() {
  const stripe = getStripe();
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
  const existing = configurations.data.find(
    (configuration) => configuration.metadata?.rhyzeManaged === 'true',
  );
  const settings = buildRhyzePortalConfiguration(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001',
  );
  const configuration = existing
    ? await stripe.billingPortal.configurations.update(existing.id, settings)
    : await stripe.billingPortal.configurations.create(settings);
  process.stdout.write(configuration.id);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
