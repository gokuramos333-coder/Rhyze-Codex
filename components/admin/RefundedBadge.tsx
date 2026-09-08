import React from 'react';

export function RefundedBadge() {
  return (
    <span
      aria-label="Refund status"
      className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] text-red-800"
    >
      REFUNDED
    </span>
  );
}
