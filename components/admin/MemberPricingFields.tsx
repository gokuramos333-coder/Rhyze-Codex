'use client';
import React, { useState } from 'react';

export function MemberPricingFields() {
  const [enabled, setEnabled] = useState(false);
  const [duration, setDuration] = useState('repeating');
  return (
    <fieldset className="grid gap-3 border border-rhyze-orange/30 bg-orange-50 p-3 sm:col-span-2">
      <label className="flex items-center gap-2 font-bold">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />{' '}
        Set a client-specific monthly price
      </label>
      {enabled && (
        <>
          <p className="text-xs text-black/65">
            Only this client’s membership changes. Enter the regular price to
            remove a previous Rhyze client discount. The public price stays the
            same.
          </p>
          <label className="grid gap-1 font-bold">
            Client price per month (USD)
            <input
              name="monthlyPrice"
              type="number"
              min="1"
              step="0.01"
              required
              placeholder="199.00"
              className="min-h-11 border border-black/20 bg-white px-3 font-normal"
            />
          </label>
          <label className="grid gap-1 font-bold">
            Discount lasts
            <select
              name="discountDuration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="min-h-11 border border-black/20 bg-white px-3 font-normal"
            >
              <option value="repeating">A set number of months</option>
              <option value="forever">Until changed</option>
            </select>
          </label>
          {duration === 'repeating' && (
            <label className="grid gap-1 font-bold">
              Number of months from activation
              <input
                name="discountMonths"
                type="number"
                min="1"
                max="36"
                step="1"
                required
                className="min-h-11 border border-black/20 bg-white px-3 font-normal"
              />
            </label>
          )}
          <p className="text-xs text-black/65">
            After a limited discount ends, Stripe automatically returns to the
            regular price. A partial starting month is included in the discount
            window.
          </p>
          <label className="grid gap-1 font-bold">
            Reason
            <input
              name="discountReason"
              minLength={3}
              maxLength={240}
              required
              placeholder="Owner-approved membership offer"
              className="min-h-11 border border-black/20 bg-white px-3 font-normal"
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
