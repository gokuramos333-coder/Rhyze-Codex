type EventTerms = { occurrenceId: string; slug: string; startAt: Date; endAt: Date; priceCents: number; isEvent: boolean };

// Exact owner-approved dates and prices. Event labels remain events; these dates accept only the earned VIP event benefit alongside cash tickets.
export const specialEventOffers = [
  { occurrenceId: 'cmvv9bp4g0001gt09ewtk8n57', slug: 'rhyzology-black-friday-neon-choreo-party-mvv992kn', startAt: '2026-11-28T00:30:00Z', endAt: '2026-11-28T01:45:00Z' },
  { occurrenceId: 'cmw026ajl0001jn09jsqpqzij', slug: 'get-fit-with-the-fishers-mw000b75', startAt: '2026-11-22T16:00:00Z', endAt: '2026-11-22T17:00:00Z' },
] as const;
export function specialEventIdentity(occurrenceId?: string, slug?: string) {
  return specialEventOffers.find(o => (!occurrenceId || o.occurrenceId === occurrenceId) && (!slug || o.slug === slug) && Boolean(occurrenceId || slug));
}
export function blackFridayOffer(terms: EventTerms) {
  const offer = specialEventIdentity(terms.occurrenceId, terms.slug);
  if (!offer || !terms.isEvent || terms.priceCents !== 2500 ||
      terms.startAt.getTime() !== Date.parse(offer.startAt) || terms.endAt.getTime() !== Date.parse(offer.endAt)) return null;
  return { singlePriceCents: 2500, pairPriceCents: 4000,
    singleLabel: 'One person — $25', pairLabel: 'Me + a NEW friend — $40 total' } as const;
}
export function specialEventOfferMatches(occurrence: {id:string;startAt:Date;endAt:Date;priceCents:number|null;template:{slug:string;isEvent:boolean;dropInPriceCents:number|null}}) {
  return Boolean(blackFridayOffer({occurrenceId:occurrence.id,slug:occurrence.template.slug,startAt:occurrence.startAt,endAt:occurrence.endAt,priceCents:occurrence.priceCents ?? occurrence.template.dropInPriceCents ?? 0,isEvent:occurrence.template.isEvent}));
}

/** US domestic default; international numbers require an explicit country prefix. */
export function normalizeFriendPhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const raw = phone.trim();
  if (raw.length > 30 || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  const normalized = raw.startsWith('+') ? `+${digits}` : digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : '';
  return /^\+[1-9]\d{9,14}$/.test(normalized) ? normalized : null;
}

export type FriendHistoryCandidate = {
  id: string; name: string | null; phone: string | null;
  attended: boolean; unresolvedPastBooking: boolean;
  importedWorkouts: number; importedLastWorkoutAt: Date | null;
};
export const normalizedFriendName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

type Assessment = { status: 'INVALID_CONTACT' | 'INELIGIBLE' | 'REVIEW_REQUIRED' | 'DECLARATION_REQUIRED' | 'ELIGIBLE'; reason: string };
/** Owner-approved first-visit declaration policy. Contact is evidence, not authentication.
 * Input includes phone OR name matches, including inactive/imported users. */
export function assessNewFriend(friend: { fullName: string; phone: string }, buyerId: string, candidates: FriendHistoryCandidate[], firstVisitDeclared = false): Assessment {
  const phone = normalizeFriendPhone(friend.phone);
  const name = normalizedFriendName(friend.fullName);
  if (!phone || name.length < 3 || name.length > 120 || name.split(' ').length < 2) return { status: 'INVALID_CONTACT', reason: 'FULL_NAME_AND_PHONE_REQUIRED' };
  const matches = candidates.filter(c => normalizeFriendPhone(c.phone) === phone || (c.name && normalizedFriendName(c.name) === name));
  if (!matches.length) return firstVisitDeclared ? { status: 'ELIGIBLE', reason: 'DECLARED_FIRST_VISIT' } : { status: 'DECLARATION_REQUIRED', reason: 'FIRST_VISIT_DECLARATION_REQUIRED' };
  if (matches.some(c => c.id === buyerId)) return { status: 'INELIGIBLE', reason: 'BUYER_IS_FRIEND' };
  if (matches.length !== 1 || normalizeFriendPhone(matches[0].phone) !== phone || !matches[0].name || normalizedFriendName(matches[0].name) !== name) return { status: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_IDENTITY' };
  if (matches.some(c => c.attended || c.importedWorkouts > 0 || c.importedLastWorkoutAt !== null)) return { status: 'INELIGIBLE', reason: 'PRIOR_ATTENDANCE' };
  if (matches[0].unresolvedPastBooking) return { status: 'REVIEW_REQUIRED', reason: 'UNRESOLVED_ATTENDANCE' };
  return firstVisitDeclared ? { status: 'ELIGIBLE', reason: 'DECLARED_FIRST_VISIT' } : { status: 'DECLARATION_REQUIRED', reason: 'FIRST_VISIT_DECLARATION_REQUIRED' };
}

/** Only the earned finite VIP event benefit, never regular/unlimited or gift credits.
 * The caller must additionally check paid VIP entitlement, dates and ledger balance. */
export function specialEventCreditAllowed(account: {isUnlimited:boolean;label:string;sourcePurchase?:unknown}) {
  return !account.isUnlimited && !account.sourcePurchase &&
    account.label.startsWith('Event credit') && account.label.toLowerCase().includes('vip complimentary event credit');
}
