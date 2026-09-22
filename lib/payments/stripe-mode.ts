/** Runtime isolation: a promoted preview must never serve sandbox billing on the live site. */
export function requiresLiveStripe() {
  // All hosted Netlify artifacts are promotable. Sandbox checkout is deliberately
  // disabled there, even if a preview's URL is missing or incorrect. Run payment
  // simulations only against an isolated local database/Stripe sandbox.
  if (process.env.NETLIFY === 'true' || ['production', 'deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT || '')) return true;
  try {
    const host = new URL(process.env.NEXT_PUBLIC_APP_URL || '').hostname;
    return host === 'www.rhyzefitness.com' || host === 'rhyzefitness.com';
  } catch {
    return false;
  }
}

export function assertStripeObjectMode(object: { livemode?: boolean }) {
  if (requiresLiveStripe() && object.livemode !== true) {
    throw new Error('Only live Stripe objects can update production; test data is refused.');
  }
}
