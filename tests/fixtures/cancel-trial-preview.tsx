import React from 'react';
import { createRoot } from 'react-dom/client';
import { CancelIntroTrialForm } from '../../components/admin/CancelIntroTrialForm';

const scenarios = [
  { id: 'active', label: 'Active 7-day intro trial without bookings' },
  {
    id: 'paused-history',
    label: 'Paused 7-day intro trial with proven past booking funding',
  },
  {
    id: 'review',
    label: 'Trial requiring review',
    blocker:
      'Ambiguous funding or future or in-progress trial bookings need review. No bookings will be removed.',
  },
];

createRoot(document.getElementById('root')!).render(
  <main className="admin-shell min-h-screen bg-[#eee9dd] p-4 text-rhyze-black sm:p-8">
    <section className="mx-auto min-w-0 max-w-3xl">
      <h1 className="font-display text-3xl">CANCEL TRIAL · REVIEW</h1>
      <p className="mt-4 border-l-4 border-rhyze-orange bg-white p-4 font-bold">
        NONPRODUCTION · SYNTHETIC PREVIEW. No real client data. All actions are
        inert.
      </p>
      {scenarios.map(({ id, label, blocker }) => (
        <section key={id} aria-label={label} className="mt-6 min-w-0">
          <h2 className="text-sm font-bold">{label}</h2>
          <CancelIntroTrialForm
            userId={`synthetic-${id}-client`}
            membershipId={`synthetic-${id}-trial`}
            action={() => {}}
            blocker={blocker}
          />
        </section>
      ))}
    </section>
  </main>,
);
// The same production component is displayed, but submits never reach an action.
document.addEventListener('submit', (event) => event.preventDefault(), true);
