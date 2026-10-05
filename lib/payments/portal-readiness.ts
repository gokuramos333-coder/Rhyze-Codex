import type Stripe from 'stripe';

type PortalReader = Pick<
  Stripe.BillingPortal.ConfigurationsResource,
  'retrieve'
>;

/** Validate the exact configuration in the key's mode; never use a broader default. */
export async function inspectPortalConfiguration(
  configurations: PortalReader,
  configurationId: string | undefined,
  live: boolean,
): Promise<{ ready: true; id: string } | { ready: false; reason: string }> {
  if (!configurationId?.trim())
    return { ready: false, reason: 'missing-configuration' };
  try {
    const configuration = await configurations.retrieve(configurationId, {
      timeout: 10000,
      maxNetworkRetries: 0,
    });
    if (
      configuration.id !== configurationId ||
      !configuration.active ||
      configuration.livemode !== live
    ) {
      return { ready: false, reason: 'configuration-mode-or-status' };
    }
    const features = configuration.features;
    if (
      !features.payment_method_update.enabled ||
      !features.invoice_history.enabled ||
      features.subscription_cancel.enabled ||
      features.subscription_update.enabled
    ) {
      return { ready: false, reason: 'configuration-features' };
    }
    return { ready: true, id: configuration.id };
  } catch {
    // Provider messages can contain account/customer details. Keep diagnostics bounded.
    return { ready: false, reason: 'configuration-unavailable' };
  }
}
