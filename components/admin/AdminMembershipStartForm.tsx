import React from 'react';

type MembershipProduct = {
  id: string;
  name: string;
  priceCents: number;
  stripePriceId: string | null;
};

type MembershipAction = (formData: FormData) => void | Promise<void>;

function PlanOptions({ products }: { products: MembershipProduct[] }) {
  return (
    <>
      <option value="">Choose a membership</option>
      {products.map((product) => (
        <option key={product.id} value={product.id}>
          {product.name} · ${(product.priceCents / 100).toFixed(2)}
          {!product.stripePriceId ? ' · assignment only' : ''}
        </option>
      ))}
    </>
  );
}

export function AdminMembershipStartForm({
  userId,
  products,
  checkoutAction,
  assignmentAction,
  minimumEndDate,
}: {
  userId: string;
  products: MembershipProduct[];
  checkoutAction: MembershipAction;
  assignmentAction: MembershipAction;
  minimumEndDate: string;
}) {
  return (
    <section id="start-membership" className="mt-5 scroll-mt-24 border border-rhyze-orange/30 bg-orange-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-coral">Start a membership</p>
      <p className="mt-2 text-sm font-bold text-rhyze-black/55">
        This client has no active recurring membership. Choose the secure paid path or a documented no-charge assignment.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <form action={checkoutAction} className="border-t-4 border-rhyze-orange bg-white p-4">
          <input type="hidden" name="userId" value={userId} />
          <h3 className="font-display text-3xl tracking-wider">PURCHASE THROUGH STRIPE</h3>
          <p className="mt-2 text-xs font-bold text-rhyze-black/50">
            Card details stay on Stripe. Access starts only after Stripe confirms payment.
          </p>
          <select name="productId" required className="mt-4 min-h-12 w-full border border-black/15 px-3">
            <PlanOptions products={products.filter((product) => product.stripePriceId)} />
          </select>
          <button className="mt-3 w-full bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase tracking-widest">
            Continue to secure checkout
          </button>
        </form>

        <form action={assignmentAction} className="border-t-4 border-rhyze-gold bg-rhyze-black p-4 text-rhyze-cream">
          <input type="hidden" name="userId" value={userId} />
          <h3 className="font-display text-3xl tracking-wider">ASSIGN WITHOUT CHARGING</h3>
          <p className="mt-2 text-xs font-bold text-rhyze-cream/60">
            This creates time-bounded access and does not charge or auto-renew.
          </p>
          <select name="productId" required className="mt-4 min-h-12 w-full border border-white/20 bg-white px-3 text-rhyze-black">
            <PlanOptions products={products} />
          </select>
          <label className="mt-3 grid gap-1 text-[10px] font-black uppercase tracking-widest">
            Access through
            <input type="date" name="accessEndDate" min={minimumEndDate} required className="min-h-12 bg-white px-3 text-rhyze-black" />
          </label>
          <label className="mt-3 grid gap-1 text-[10px] font-black uppercase tracking-widest">
            Assignment reason
            <input name="reason" minLength={3} maxLength={240} required placeholder="Example: walk-in courtesy membership" className="min-h-12 bg-white px-3 text-rhyze-black" />
          </label>
          <button className="mt-3 w-full bg-rhyze-gold px-4 py-3 text-xs font-black uppercase tracking-widest text-rhyze-black">
            Assign membership
          </button>
        </form>
      </div>
    </section>
  );
}
