// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AdminMembershipStartForm } from '../../../components/admin/AdminMembershipStartForm';
afterEach(cleanup);
const products = [{ id: 'synthetic', name: 'Synthetic extended unlimited membership with a very long descriptive plan name', priceCents: 19900, stripePriceId: 'synthetic_price' }];
it('shrinks pricing fieldset and its controls when enabled', () => {
 const {container, getByRole} = render(<AdminMembershipStartForm userId="synthetic" products={products} checkoutAction={()=>{}} assignmentAction={()=>{}} minimumEndDate="2026-11-08" />);
 fireEvent.click(getByRole('checkbox'));
 expect(container.querySelector('fieldset')?.className).toContain('min-w-0');
 for (const control of container.querySelectorAll('fieldset select, fieldset input:not([type=checkbox])')) {
  expect(control.className).toContain('min-w-0'); expect(control.className).toContain('w-full');
 }
});
it('uses available panel width rather than viewport to split forms', () => {
 const {container} = render(<AdminMembershipStartForm userId="synthetic" products={products} checkoutAction={()=>{}} assignmentAction={()=>{}} minimumEndDate="2026-11-08" />);
 expect(container.innerHTML).toContain('auto-fit');
 expect(container.innerHTML).not.toContain('xl:grid-cols-2');
});
it('keeps a wrapping full selected plan label visible', () => {
 const {container, getAllByRole} = render(<AdminMembershipStartForm userId="synthetic" products={products} checkoutAction={()=>{}} assignmentAction={()=>{}} minimumEndDate="2026-11-08" />);
 fireEvent.change(getAllByRole('combobox')[0], {target:{value:'synthetic'}});
 const description = container.querySelector('output');
 expect(description?.textContent).toContain(products[0].name);
 expect(description?.className).toContain('break-words');
});
it('shows full discount duration and examples outside single-line controls', () => {
 const {container, getByRole} = render(<AdminMembershipStartForm userId="synthetic" products={products} checkoutAction={()=>{}} assignmentAction={()=>{}} minimumEndDate="2026-11-08" />);
 fireEvent.click(getByRole('checkbox'));
 expect(container.querySelector('fieldset output')?.textContent).toBe('A set number of months');
 expect(container.querySelector('fieldset')?.textContent).toContain('Owner-approved membership offer');
 expect(container.querySelectorAll('form')[1].textContent).toContain('Example: walk-in courtesy membership');
});
it('preserves native product payloads, filtering and pricing controls', () => {
 const {container, getByRole} = render(<AdminMembershipStartForm userId="synthetic" products={[...products,{id:'assignment-only',name:'Synthetic assignment',priceCents:10000,stripePriceId:null}]} checkoutAction={()=>{}} assignmentAction={()=>{}} minimumEndDate="2026-11-08" />);
 const forms=container.querySelectorAll('form');
 const selects=container.querySelectorAll('select[name=productId]');
 expect(selects[0].querySelector('option[value="assignment-only"]')).toBeNull();
 expect(selects[1].querySelector('option[value="assignment-only"]')).not.toBeNull();
 fireEvent.change(selects[0],{target:{value:'synthetic'}});
 expect(new FormData(forms[0]).get('productId')).toBe('synthetic');
 expect(new FormData(forms[0]).get('userId')).toBe('synthetic');
 fireEvent.click(getByRole('checkbox'));
 fireEvent.change(container.querySelector('select[name=discountDuration]')!,{target:{value:'forever'}});
 expect(container.querySelector('fieldset output')?.textContent).toBe('Until changed');
 expect(container.querySelector('input[name=discountMonths]')).toBeNull();
 expect(new FormData(forms[0]).get('discountDuration')).toBe('forever');
});
it('places memberships outside the narrow profile/history grid', () => {
 const source=readFileSync('app/(studio)/admin/members/[userId]/page.tsx','utf8');
 expect(source.indexOf('<InfoSection id="memberships"')).toBeLessThan(source.indexOf('xl:grid-cols-[1fr_1.35fr]'));
});
