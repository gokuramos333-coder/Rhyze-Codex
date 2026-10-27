// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ template: vi.fn(), templates: vi.fn(), occurrence: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { classTemplate: { findFirst: mocks.template, findMany: mocks.templates }, classOccurrence: { findUnique: mocks.occurrence }, waiverVersion: { findFirst: async()=>({ id:'waiver' }) }, waiverAcceptance: { findUnique: async()=>({ id:'acceptance' }) } } }));
vi.mock('@/lib/auth/session', () => ({ requireArea: async()=>({ id:'member' }) }));
vi.mock('@/app/(portal)/member/bookings/actions', () => ({ bookOccurrenceAction: async()=>{} }));
vi.mock('next/navigation', () => ({ notFound: ()=>{throw Error('not found');} }));
import { EventsPreview } from '@/components/sections/EventsPreview';
import EventDetailPage from '@/app/events/[slug]/page';
import NewBookingPage from '@/app/(portal)/member/bookings/new/page';
let occurrence: any;
let template: any;
beforeEach(()=>{
 template={id:'event',slug:'synthetic-event',name:'Synthetic Event',description:'Synthetic event description.',isEvent:true,durationMinutes:50,dropInPriceCents:3000,imageUrl:'/brand/rhyze-logo-header.png'};
 occurrence={id:'second-date',template,startAt:new Date('2099-10-24T16:00:00Z'),endAt:new Date('2099-10-24T16:50:00Z'),status:'SCHEDULED',capacity:3,historicalSignupCount:1,instructor:null,room:null,_count:{bookings:2,waitlistEntries:4}};
 mocks.template.mockResolvedValue({...template,occurrences:[occurrence]});mocks.templates.mockResolvedValue([{...template,occurrences:[occurrence]}]);mocks.occurrence.mockResolvedValue(occurrence);
});
afterEach(cleanup);
it('confirms the substitute title/name without changing the canonical instructor', async () => {
 occurrence.titleOverride='Zumba'; occurrence.substituteInstructorName='Vincent'; occurrence.isSubstitute=true; occurrence.instructor={name:'Melissa'};
 render(await NewBookingPage({searchParams:Promise.resolve({occurrence:'second-date'})}));
 expect(screen.getByRole('heading',{name:'Zumba'})).toBeTruthy();
 expect(screen.getByText(/Vincent/)).toBeTruthy(); expect(screen.getByText('Substitute')).toBeTruthy();
 expect(occurrence.instructor.name).toBe('Melissa');
});
it('explains November ANY-event monthly expiry on the actual confirmation page', async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T17:00Z'));
 try {
  occurrence.startAt=new Date('2026-11-15T17:00Z');
  render(await NewBookingPage({searchParams:Promise.resolve({occurrence:'second-date'})}));
  expect(screen.getByText(/ANY event, including Tricia/)).toBeTruthy();
  expect(screen.getByText(/no rollover/)).toBeTruthy();
 } finally { vi.useRealTimers(); }
});
it('marks full home/events cards sold out even with fewer than ten bookings',async()=>{
 render(await EventsPreview({}));
 expect(screen.getByText('Sold out · Waiting list available')).toBeTruthy();
 expect(screen.queryByText('Booking available')).toBeNull();
 expect(screen.getByRole('link',{name:/Synthetic Event/}).getAttribute('href')).toContain('occurrence=second-date');
});
it('offers waitlist entry from the event detail and retains its date',async()=>{
 render(await EventDetailPage({params:Promise.resolve({slug:'synthetic-event'}),searchParams:Promise.resolve({occurrence:'second-date'})}));
 expect(screen.getByText('Sold out · Waiting list available')).toBeTruthy();
 expect(screen.getByRole('link',{name:'Join Waiting List'}).getAttribute('href')).toBe('/book/event/synthetic-event?occurrence=second-date');
});
it('explains that joining a full class is not a confirmed reservation',async()=>{
 render(await NewBookingPage({searchParams:Promise.resolve({occurrence:'second-date'})}));
 expect(screen.getByRole('button',{name:'Join waiting list'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Confirm my place'})).toBeNull();
 expect(screen.getByText(/Joining is free and uses no credit/)).toBeTruthy();
});
it('disables joining after the fifth waiting person and enables normal booking when a place opens',async()=>{
 occurrence._count.waitlistEntries=5;
 render(await NewBookingPage({searchParams:Promise.resolve({occurrence:'second-date'})}));
 expect((screen.getByRole('button',{name:'Waiting list full'}) as HTMLButtonElement).disabled).toBe(true);
 cleanup();occurrence._count.bookings=1;
 render(await NewBookingPage({searchParams:Promise.resolve({occurrence:'second-date'})}));
 expect((screen.getByRole('button',{name:'Confirm my place'}) as HTMLButtonElement).disabled).toBe(false);
});
