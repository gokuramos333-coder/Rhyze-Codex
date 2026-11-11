import React from 'react';
import { MemberPricingFields } from './MemberPricingFields';
import { MembershipPlanSelect } from './MembershipPlanSelect';

type MembershipProduct = {
  id: string;
  name: string;
  priceCents: number;
  stripePriceId: string | null;
};

type MembershipAction = (formData: FormData) => void | Promise<void>;

export function AdminMembershipStartForm({
  userId,
  products,
  checkoutAction,
  assignmentAction,
  minimumEndDate,
  hasIntroTrialHistory = false,
}: {
  userId: string;
  products: MembershipProduct[];
  checkoutAction: MembershipAction;
  assignmentAction: MembershipAction;
  minimumEndDate: string;
  hasIntroTrialHistory?: boolean;
}) {
  return (
    <section id="start-membership" className="mt-5 min-w-0 break-words scroll-mt-24 border border-rhyze-orange/30 bg-orange-50 p-3 sm:p-4">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-coral">Start a membership</p>
      <p className="mt-2 text-sm font-bold text-rhyze-black/55">
        This client has no active recurring membership. Choose the secure paid path or a documented no-charge assignment.
      </p>
      <div className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-4">
        {hasIntroTrialHistory ? <p role="alert" className="min-w-0 bg-white p-3 text-sm font-bold">Checkout unavailable: trial-to-paid billing needs separate review. Cancelling a trial does not authorize a paid plan.</p> : <form action={checkoutAction} className="min-w-0 border-t-4 border-rhyze-orange bg-white p-3 sm:p-4">
          <input type="hidden" name="userId" value={userId} />
          <h3 className="font-display text-2xl sm:text-3xl tracking-wider">PURCHASE THROUGH STRIPE</h3>
          <p className="mt-2 text-xs font-bold text-rhyze-black/50">
            Card details stay on Stripe. Access starts only after Stripe confirms payment.
          </p>
          <MembershipPlanSelect products={products.filter((product) => product.stripePriceId)} className="mt-4 min-h-12 min-w-0 w-full border border-black/15 px-3" />
          <div className="mt-3 min-w-0 text-sm"><MemberPricingFields /></div>
          <p className="mt-3 text-xs">Review the amount on Stripe before paying. Creating checkout does not grant access or charge the card.</p>
          <button className="mt-3 w-full bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase tracking-widest">
            Continue to secure checkout
          </button>
        </form>}

        <form action={assignmentAction} className="min-w-0 border-t-4 border-rhyze-gold bg-rhyze-black p-3 sm:p-4 text-rhyze-cream">
          <input type="hidden" name="userId" value={userId} />
          <h3 className="font-display text-2xl sm:text-3xl tracking-wider">ASSIGN WITHOUT CHARGING</h3>
          <p className="mt-2 text-xs font-bold text-rhyze-cream/60">
            This creates time-bounded access and does not charge or auto-renew.
          </p>
          <MembershipPlanSelect products={products} className="mt-4 min-h-12 min-w-0 w-full border border-white/20 bg-white px-3 text-rhyze-black" />
          <label className="mt-3 grid min-w-0 gap-1 text-[10px] font-black uppercase tracking-widest">
            Access through
            <input type="date" name="accessEndDate" min={minimumEndDate} required className="min-h-12 min-w-0 w-full bg-white px-3 text-rhyze-black" />
          </label>
          <label className="mt-3 grid min-w-0 gap-1 text-[10px] font-black uppercase tracking-widest">
            Assignment reason
            <input name="reason" minLength={3} maxLength={240} required  className="min-h-12 min-w-0 w-full bg-white px-3 text-rhyze-black" />
            <span className="text-xs font-normal normal-case tracking-normal">Example: walk-in courtesy membership</span>
          </label>
          <button className="mt-3 w-full bg-rhyze-gold px-4 py-3 text-xs font-black uppercase tracking-widest text-rhyze-black">
            Assign membership
          </button>
        </form>
      </div>
    </section>
  );
}
