'use client';
import React, { useId, useState } from 'react';

type MembershipProduct = {
  id: string;
  name: string;
  priceCents: number;
  stripePriceId: string | null;
};

const planLabel = (product: MembershipProduct) =>
  `${product.name} · $${(product.priceCents / 100).toFixed(2)}${!product.stripePriceId ? ' · assignment only' : ''}`;

// Native selects cannot wrap their selected text. Keep the full label visible
// below the control without changing its submitted value or native keyboard UI.
export function MembershipPlanSelect({ products, className }: {
  products: MembershipProduct[];
  className: string;
}) {
  const id = useId();
  const [selectedId, setSelectedId] = useState('');
  const selected = products.find((product) => product.id === selectedId);
  return (
    <div className="min-w-0">
      <select id={id} name="productId" required aria-label="Membership plan" aria-describedby={`${id}-label`}
        onChange={(event) => setSelectedId(event.target.value)} className={className}>
        <option value="">Choose a membership</option>
        {products.map((product) => <option key={product.id} value={product.id}>{planLabel(product)}</option>)}
      </select>
      <output id={`${id}-label`} htmlFor={id} className="mt-2 block min-w-0 whitespace-normal break-words text-sm">
        {selected ? planLabel(selected) : 'Choose a membership'}
      </output>
    </div>
  );
}
