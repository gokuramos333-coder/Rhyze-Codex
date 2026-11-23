import { earnedEventCreditCovers, hasRetainedEventReservation } from '@/lib/payments/special-event-credit';
import {expect,it} from 'vitest';
import {blackFridayOffer,specialEventOffers,specialEventCreditAllowed} from '@/lib/payments/black-friday-new-friend';
it.each(specialEventOffers)('validates exact terms for $slug and rejects stale $30/date input',offer=>{
 const terms={...offer,templateId:offer.templateId ?? undefined,startAt:new Date(offer.startAt),endAt:new Date(offer.endAt),priceCents:offer.singlePriceCents,isEvent:true};
 expect(blackFridayOffer(terms)).toMatchObject({singlePriceCents:offer.singlePriceCents,pairPriceCents:offer.pairPriceCents});
 expect(blackFridayOffer({...terms,priceCents:offer.singlePriceCents+100})).toBeNull();
 expect(blackFridayOffer({...terms,startAt:new Date(+terms.startAt+86400000)})).toBeNull();
 expect(blackFridayOffer({...terms,occurrenceId:'different'})).toBeNull();
 expect(blackFridayOffer({...terms,templateId:'wrong-template'})).toBeNull();
});
it('accepts only a finite earned VIP event credit, never unlimited, class, package or gift credits',()=>{
 const vip={isUnlimited:false,label:'Event credit — November 2026 VIP complimentary event credit — expires 2026-11-30',sourcePurchase:null};
 expect(specialEventCreditAllowed(vip)).toBe(true);
 expect(specialEventCreditAllowed({...vip,isUnlimited:true})).toBe(false);
 for(const label of ['Elevate','Class pack','Event credit — cancellation','Gift event credit','VIP membership — unlimited standard class credits'])expect(specialEventCreditAllowed({...vip,label})).toBe(false);
 expect(specialEventCreditAllowed({...vip,sourcePurchase:{}})).toBe(false);
});

it('requires a spendable earned event-month account covering purchase time and the occurrence',()=>{
 const now=new Date('2026-12-02T12:00Z'),start=new Date('2026-12-27T16:00Z');
 const account={id:'earned',isUnlimited:false,sourcePurchaseId:null,label:'Event credit — December 2026 VIP complimentary event credit — expires 2026-12-31',
   validFrom:new Date('2026-12-01T05:00Z'),validUntil:new Date('2027-01-01T05:00Z'),entries:[{quantity:1}]};
 expect(earnedEventCreditCovers(account,now,start)).toBe(true);
 for(const change of [{id:'gift-credit:BOTH:fixture'}, {sourcePurchaseId:'purchase'}, {isUnlimited:true}, {validUntil:start}, {validFrom:start}, {validUntil:null},
   {entries:[{quantity:1},{quantity:-1}]}, {label:'Event credit — November 2026 VIP complimentary event credit — expires 2026-11-30'}])
   expect(earnedEventCreditCovers({...account,...change},now,start)).toBe(false);
});

it('requires exactly one original net event reservation on the recorded account',()=>{
 const bookedAt=new Date('2026-12-02T12:00Z'),start=new Date('2026-12-27T16:00Z');
 const account={id:'original',isUnlimited:false,sourcePurchaseId:null,label:'Event credit — December 2026 VIP complimentary event credit — expires 2026-12-31',
   validFrom:new Date('2026-12-01T05:00Z'),validUntil:new Date('2027-01-01T05:00Z'),entries:[{quantity:1},{quantity:-1}]};
 const reserve={creditAccountId:'original',type:'RESERVE',quantity:-1};
 const release={...reserve,type:'RELEASE',quantity:1};
 expect(hasRetainedEventReservation(account,bookedAt,start,[reserve])).toBe(true);
 expect(hasRetainedEventReservation({...account,entries:[{quantity:-1}]},bookedAt,start,[reserve])).toBe(false);
 expect(hasRetainedEventReservation(account,bookedAt,start,[reserve,release,reserve])).toBe(true);
 expect(hasRetainedEventReservation(account,bookedAt,start,[{...reserve,creditAccountId:'prior'},{...release,creditAccountId:'prior'},reserve])).toBe(true);
 for (const entries of [[],[reserve,release],[reserve,reserve],[{...reserve,creditAccountId:'other'}],
   [reserve,{...reserve,creditAccountId:'other'}],[reserve,{...release,type:'GRANT',creditAccountId:'replacement'}]]) {
   expect(hasRetainedEventReservation(account,bookedAt,start,entries)).toBe(false);
 }
});
