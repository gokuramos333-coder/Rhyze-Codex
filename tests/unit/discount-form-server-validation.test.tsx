// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DiscountCampaignForm } from '@/components/admin/DiscountCampaignForm';
const mocks=vi.hoisted(()=>({transaction:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApprovedOwner:async()=>({id:'synthetic-owner'})}));
vi.mock('@/lib/db/prisma',()=>({prisma:{$transaction:mocks.transaction}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:vi.fn()}));
import { createDiscountCampaignAction } from '@/app/(studio)/admin/discounts/actions';
afterEach(cleanup);
it('actual server validation and database rejection both retain filled form for correction and retry',async()=>{
 mocks.transaction.mockRejectedValue(Error('synthetic duplicate code'));
 const {container}=render(<DiscountCampaignForm products={[{id:'pack',name:'Pack'}]} action={createDiscountCampaignAction}/>);
 const input=(name:string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
 const values={code:'KEEPSERVER',percentOff:'15',startsAt:'2030-11-20T10:00',endsAt:'2030-11-20T09:00'};
 for(const [name,value] of Object.entries(values))fireEvent.change(input(name),{target:{value}});
 fireEvent.click(screen.getByLabelText('Pack'));
 fireEvent.submit(container.querySelector('form')!);
 await screen.findByRole('alert');expect(mocks.transaction).not.toHaveBeenCalled();
 for(const [name,value] of Object.entries(values))expect(input(name).value).toBe(value);
 expect((screen.getByLabelText('Pack') as HTMLInputElement).checked).toBe(true);
 fireEvent.change(input('endsAt'),{target:{value:'2030-11-20T10:10'}});
 fireEvent.submit(container.querySelector('form')!);
 await screen.findByText(/Unable to create code/);expect(mocks.transaction).toHaveBeenCalledTimes(1);
 for(const [name,value] of Object.entries({...values,endsAt:'2030-11-20T10:10'}))expect(input(name).value).toBe(value);
 expect((screen.getByLabelText('Pack') as HTMLInputElement).checked).toBe(true);
});
