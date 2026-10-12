import { isMemberClassEvent } from '@/lib/catalog/member-class-event';
import { EVENT_CREDIT_LABEL_PREFIX } from './booking-rules';

/** Order only; the caller must still validate every account's entitlement. */
export function prioritizeMemberEventCredits<T extends { isUnlimited: boolean; label: string }>(
  accounts: T[],
  template: { slug?: string; isEvent: boolean },
): T[] {
  if (!isMemberClassEvent(template)) return accounts;
  const priority = (account: T) => account.isUnlimited ? 0
    : account.label.startsWith(EVENT_CREDIT_LABEL_PREFIX) ? 2 : 1;
  return [...accounts].sort((a, b) => priority(a) - priority(b));
}
