import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  TrialUpgradePanel,
  CancelIntroTrialForm,
} from '../../components/admin/TrialUpgradePanel';

const products = [
  {
    id: 'synthetic-elevate',
    name: 'Elevate',
    kind: 'LIMITED_MEMBERSHIP',
    billingInterval: 'MONTHLY',
    priceCents: 9200,
    stripePriceId: 'synthetic-price',
    isActive: true,
  },
  {
    id: 'synthetic-long',
    name: 'Synthetic unlimited membership with an exceptionally long descriptive name for narrow-panel verification',
    kind: 'MONTHLY_UNLIMITED',
    billingInterval: 'MONTHLY',
    priceCents: 14900,
    stripePriceId: 'synthetic-long-price',
    isActive: true,
  },
];
createRoot(document.getElementById('root')!).render(
  <main className="admin-shell min-h-screen bg-[#eee9dd] text-rhyze-black">
    <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="bg-rhyze-black p-5 text-rhyze-cream">
        <h1 className="font-display text-3xl">RHYZE · REVIEW</h1>
        <p className="mt-3 text-sm">Synthetic client profile</p>
      </aside>
      <section className="min-w-0 px-5 py-8 md:px-8 lg:px-10">
        <p className="mb-5 border-l-4 border-rhyze-orange bg-white p-4 font-bold">
          NONPRODUCTION · SYNTHETIC PREVIEW. No real client data. All actions
          are inert.
        </p>
        <section
          id="memberships"
          className="min-w-0 border-t-4 border-rhyze-gold bg-white p-5"
        >
          <h2 className="font-display text-4xl">MEMBERSHIPS</h2>
          <p className="mt-2 text-sm font-bold">
            Synthetic client · Active 7-day intro trial
          </p>
          <CancelIntroTrialForm
            userId="synthetic-client"
            membershipId="synthetic-trial"
            action={() => {}}
          />
          <p className="mt-5 text-sm font-bold">
            Synthetic client with existing trial bookings
          </p>
          <CancelIntroTrialForm
            userId="synthetic-booked-client"
            membershipId="synthetic-booked-trial"
            action={() => {}}
            blocker="Trial or ambiguous booking history needs review. Cancellation is unavailable here; no bookings will be removed."
          />
          <TrialUpgradePanel
            email="synthetic-client@example.test"
            products={products}
          />
        </section>
      </section>
    </div>
  </main>,
);
document.addEventListener('submit', (event) => event.preventDefault(), true);
