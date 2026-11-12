// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {DiscountCampaignForm} from '@/components/admin/DiscountCampaignForm';
import {saleWindowEnd} from '@/lib/domain/discounts/sale-window';
afterEach(cleanup);
it('sets short NJ sale windows independently from lifetime billing and retains errors',async()=>{
 const action=vi.fn().mockResolvedValue({error:'Synthetic rejection'});
 const {container}=render(<DiscountCampaignForm products={[{id:'vip',name:'VIP',billingInterval:'MONTHLY'},{id:'pack',name:'Pack',billingInterval:'ONE_TIME'}]} action={action}/>);
 fireEvent.change(screen.getByLabelText('Redemption starts (Eastern)'),{target:{value:'2030-11-20T10:00'}});
 fireEvent.change(screen.getByLabelText('Sale length'),{target:{value:'3'}});fireEvent.change(screen.getByLabelText('Sale length unit'),{target:{value:'hours'}});fireEvent.click(screen.getByText('Set end date'));
 expect((screen.getByLabelText('Redemption ends (Eastern, exclusive)') as HTMLInputElement).value).toBe('2030-11-20T13:00');
 fireEvent.click(screen.getByLabelText('Pack'));fireEvent.change(screen.getByLabelText('Membership discount lasts'),{target:{value:'forever'}});
 expect((container.querySelector('[value="pack"]') as HTMLInputElement).disabled).toBe(true);expect((container.querySelector('[value="pack"]') as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByLabelText('VIP'));fireEvent.click(screen.getByLabelText('No end date — available until disabled'));
 fireEvent.submit(container.querySelector('form')!);await screen.findByRole('alert');
 const f=action.mock.calls[0][0] as FormData;expect(f.get('noEnd')).toBe('true');expect(f.get('endsAt')).toBeNull();expect(f.get('duration')).toBe('forever');expect(f.getAll('productIds')).toEqual(['vip']);
 expect((screen.getByLabelText('Membership discount lasts') as HTMLSelectElement).value).toBe('forever');
});
it('uses calendar months with end-of-month clamping and preserves DST wall clock',()=>{
 expect(saleWindowEnd('2030-01-31T12:00',1,'months')).toBe('2030-02-28T12:00');
 expect(saleWindowEnd('2026-03-07T12:00',1,'days')).toBe('2026-03-08T12:00');
 expect(saleWindowEnd('2030-01-01T12:00',2,'weeks')).toBe('2030-01-15T12:00');
 expect(saleWindowEnd('2030-01-01T12:00',0,'days')).toBe('');
});
