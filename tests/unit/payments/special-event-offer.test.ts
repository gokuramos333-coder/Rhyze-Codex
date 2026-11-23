import { earnedEventCreditCovers } from '@/lib/payments/special-event-credit';
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
