import type Stripe from 'stripe';

export function buildRhyzePortalConfiguration(
  appOrigin: string,
): Stripe.BillingPortal.ConfigurationCreateParams {
  const origin = appOrigin.replace(/\/$/, '');

  return {
    name: 'Rhyze Fitness member billing',
    default_return_url: `${origin}/member/billing`,
    business_profile: {
      headline: 'Manage your Rhyze Fitness payment method and invoices.',
      privacy_policy_url: `${origin}/policies`,
      terms_of_service_url: `${origin}/policies`,
    },
    features: {
      customer_update: { enabled: true, allowed_updates: ['address', 'email', 'name', 'phone'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { rhyzeManaged: 'true' },
  };
}
