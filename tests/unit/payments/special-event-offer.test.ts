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
