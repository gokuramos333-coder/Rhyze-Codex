// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiscountCampaignForm } from '@/components/admin/DiscountCampaignForm';
afterEach(cleanup);
it('retains every entered field on rejection, retries the same payload, and resets only success', async () => {
 const action = vi.fn().mockResolvedValueOnce({error:'Choose an unused code. Your entries are retained.'}).mockResolvedValueOnce(undefined);
 const {container}=render(<DiscountCampaignForm products={[{id:'pack',name:'Pack'},{id:'monthly',name:'Monthly'}]} action={action}/>);
 const values={code:'KEEPMYCODE',percentOff:'15',startsAt:'2030-11-20T10:00',endsAt:'2030-11-20T10:10'};
 const input=(name:string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
 for(const [name,value] of Object.entries(values)) fireEvent.change(input(name),{target:{value}});
 fireEvent.click(screen.getByLabelText('Pack')); fireEvent.click(screen.getByLabelText('Monthly'));
 expect((screen.getByLabelText('Pack') as HTMLInputElement).checked).toBe(true);
 expect((screen.getByLabelText('Monthly') as HTMLInputElement).checked).toBe(true);
 fireEvent.submit(container.querySelector('form')!); await screen.findByRole('alert');
 for(const [name,value] of Object.entries(values)) expect(input(name).value).toBe(value);
 expect((screen.getByLabelText('Pack') as HTMLInputElement).checked).toBe(true);
 expect((screen.getByLabelText('Monthly') as HTMLInputElement).checked).toBe(true);
 fireEvent.submit(container.querySelector('form')!);
 await waitFor(()=>expect(action).toHaveBeenCalledTimes(2));
 expect([...action.mock.calls[1][0].entries()]).toEqual([...action.mock.calls[0][0].entries()]);
 await waitFor(()=>expect(input('code').value).toBe(''));
 for(const name of Object.keys(values)) expect(input(name).value).toBe('');
 expect((screen.getByLabelText('Pack') as HTMLInputElement).checked).toBe(false);
 expect((screen.getByLabelText('Monthly') as HTMLInputElement).checked).toBe(false);
});
