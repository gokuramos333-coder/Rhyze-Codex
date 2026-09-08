'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

type Item = {
  id: string;
  name: string;
  type: string;
  price: string;
  billing: string;
  description: string;
  active: boolean;
};

export function MembershipCatalogOrder({
  initialItems,
  saveOrder,
  toggleProduct,
  deleteProduct,
}: {
  initialItems: Item[];
  saveOrder: (formData: FormData) => Promise<void>;
  toggleProduct: (formData: FormData) => Promise<void>;
  deleteProduct: (formData: FormData) => Promise<void>;
}) {
  const [items, setItems] = useState(initialItems);
  const [dragged, setDragged] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const data = new FormData();
    data.set('orderedIds', items.map((item) => item.id).join(','));
    startTransition(() => saveOrder(data));
  }

  async function toggle(product: Item) {
    const data = new FormData();
    data.set('id', product.id);
    setTogglingId(product.id);
    setItems((current) =>
      current.map((item) =>
        item.id === product.id ? { ...item, active: !item.active } : item,
      ),
    );
    try {
      await toggleProduct(data);
    } catch {
      setItems((current) =>
        current.map((item) =>
          item.id === product.id ? { ...item, active: product.active } : item,
        ),
      );
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <div className="mt-8 grid gap-3 lg:grid-cols-2">
        {items.map((product, index) => (
          <article
            key={product.id}
            draggable
            onDragStart={() => setDragged(product.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!dragged || dragged === product.id) return;
              setItems((current) => {
                const next = [...current];
                const from = next.findIndex((entry) => entry.id === dragged);
                const to = next.findIndex((entry) => entry.id === product.id);
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
              });
              setDragged(null);
            }}
            className="cursor-grab border-l-4 border-rhyze-orange bg-white p-5 active:cursor-grabbing"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-rhyze-black/40">
              #{index + 1} on website · Drag to reorder
            </p>
            <p className="mt-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">{product.type}</p>
            <h2 className="mt-2 font-display text-3xl tracking-wider">{product.name}</h2>
            <p className="mt-2 text-sm text-rhyze-black/55">{product.price} · {product.billing}</p>
            <p className="mt-3 line-clamp-3 text-sm">{product.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/admin/products/${product.id}`} className="border border-rhyze-orange px-3 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">Edit</Link>
              <button
                type="button"
                onClick={() => toggle(product)}
                disabled={togglingId === product.id}
                className="border border-rhyze-black px-3 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {togglingId === product.id
                  ? 'Saving…'
                  : product.active
                    ? 'Deactivate'
                    : 'Activate'}
              </button>
              <form action={deleteProduct}>
                <input type="hidden" name="id" value={product.id} />
                <button className="border border-rhyze-coral px-3 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">Delete</button>
              </form>
            </div>
          </article>
        ))}
      </div>
      <button type="button" onClick={save} disabled={pending} className="mt-4 bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest disabled:opacity-50">
        {pending ? 'Saving order…' : 'Save website order'}
      </button>
    </>
  );
}
