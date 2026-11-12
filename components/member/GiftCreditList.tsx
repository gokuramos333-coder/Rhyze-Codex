import {
  giftCreditKind,
  giftCreditReason,
  giftKindLabels,
} from '@/lib/domain/credits/gift-credit';
type Account = {
  id: string;
  label: string;
  validUntil: Date | null;
  entries: { type: string; quantity: number; reason: string | null }[];
};
export function GiftCreditList({
  accounts,
  now,
  grants = [],
}: {
  accounts: Account[];
  now: Date;
  grants?: { after: unknown; actor: { name: string | null } | null }[];
}) {
  const gifts = accounts.filter((a) => giftCreditKind(a));
  if (!gifts.length) return null;
  return (
    <section
      className="mt-4 border border-rhyze-gold/40 bg-yellow-50 p-4"
      aria-label="Gift credits"
    >
      <h3 className="font-display text-3xl">YOUR GIFT CREDITS</h3>
      <p className="mt-1 text-sm">
        Separate from membership benefits. A class-or-event gift is one shared
        credit and is included in the event-credit total.
      </p>
      <div className="mt-3 grid gap-3">
        {gifts.map((a) => {
          const balance = a.entries.reduce((sum, e) => sum + e.quantity, 0);
          const expired = !a.validUntil || a.validUntil <= now;
          const actor = grants.find(
            (g) =>
              (g.after as { creditAccountId?: string } | null)
                ?.creditAccountId === a.id,
          )?.actor;
          return (
            <div
              key={a.id}
              className="border-l-4 border-rhyze-gold bg-white p-3 text-sm"
            >
              <p className="font-bold">
                {giftKindLabels[giftCreditKind(a)!]} ·{' '}
                {expired
                  ? 'Expired'
                  : balance > 0
                    ? '1 available'
                    : 'Used or reserved'}
              </p>
              <p className="mt-1">{giftCreditReason(a.entries)}</p>
              <p className="mt-1">
                Use for a class/event starting through{' '}
                {a.validUntil
                  ? new Date(+a.validUntil - 1).toLocaleDateString('en-US', {
                      timeZone: 'America/New_York',
                      dateStyle: 'medium',
                    })
                  : '—'}{' '}
                (New Jersey).
              </p>
              {actor && (
                <p className="mt-1">
                  Granted by {actor.name || 'Studio staff'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
