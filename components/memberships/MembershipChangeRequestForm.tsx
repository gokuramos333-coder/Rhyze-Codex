'use client';

import { useRef, useState } from 'react';
import { requestMembershipChangeAction } from '@/app/(portal)/member/membership/actions';

type ReplacementPlan = { id: string; name: string };

export function MembershipChangeRequestForm({
  membershipId,
  replacementPlans,
  nextBillingDate,
}: {
  membershipId: string;
  replacementPlans: ReplacementPlan[];
  nextBillingDate: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [requestType, setRequestType] = useState('');

  return (
    <>
      <form
        ref={formRef}
        action={requestMembershipChangeAction}
        onSubmit={(event) => {
          if (requestType === 'CANCEL' && !confirmed.current) {
            event.preventDefault();
            setShowConfirmation(true);
          }
        }}
        className="mt-6 grid gap-4 border border-rhyze-orange/30 bg-orange-50 p-5 md:grid-cols-2"
      >
        <input type="hidden" name="membershipId" value={membershipId} />
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          Request
          <select
            name="type"
            required
            value={requestType}
            onChange={(event) => setRequestType(event.target.value)}
            className="min-h-12 border border-rhyze-orange/30 bg-white px-3 text-sm font-normal normal-case tracking-normal"
          >
            <option value="">Choose an option</option>
            <option value="CHANGE">Change my plan</option>
            <option value="CANCEL">Cancel at period end</option>
          </select>
        </label>
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          New plan <span className="font-normal normal-case tracking-normal">(required only when changing)</span>
          <select name="requestedProductId" className="min-h-12 border border-rhyze-orange/30 bg-white px-3 text-sm font-normal normal-case tracking-normal">
            <option value="">Select a new plan</option>
            {replacementPlans.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest md:col-span-2">
          {requestType === 'CANCEL' ? 'Cancellation reason' : 'Note for Admin'}
          <span className="font-normal normal-case tracking-normal">
            {requestType === 'CANCEL' ? '(required)' : '(optional)'}
          </span>
          <textarea name="memberNote" required={requestType === 'CANCEL'} maxLength={1000} rows={3} className="border border-rhyze-orange/30 bg-white p-3 text-sm font-normal normal-case tracking-normal" />
        </label>
        <div className="text-xs font-bold leading-5 text-rhyze-black/60 md:col-span-2">
          <p>Submitting does not immediately change billing or access. Management must approve the request.</p>
          <p className="mt-1">Cancellation requests must be submitted at least 14 days before your next billing date. Your current next billing date is {nextBillingDate}.</p>
        </div>
        <button className="min-h-12 bg-rhyze-black px-5 text-xs font-black uppercase tracking-widest text-white md:col-span-2">Change or Cancel Plan</button>
      </form>

      {showConfirmation && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-labelledby="cancel-request-title">
          <div className="max-w-lg border-t-4 border-rhyze-coral bg-rhyze-cream p-6 text-rhyze-black shadow-2xl">
            <h2 id="cancel-request-title" className="font-display text-4xl tracking-wider">MANAGEMENT APPROVAL REQUIRED</h2>
            <p className="mt-4 leading-7">Your plan will remain active while management reviews your cancellation reason.</p>
            <p className="mt-3 border-l-4 border-rhyze-gold bg-orange-50 p-4 text-sm font-bold">Cancellation requests must be received at least 14 days before the next billing date. Requests inside that window may apply to the following billing cycle.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => setShowConfirmation(false)} className="border border-rhyze-black px-5 py-3 text-xs font-black uppercase">Go back</button>
              <button
                type="button"
                onClick={() => {
                  confirmed.current = true;
                  setShowConfirmation(false);
                  formRef.current?.requestSubmit();
                }}
                className="bg-rhyze-black px-5 py-3 text-xs font-black uppercase text-white"
              >
                Send request to management
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
