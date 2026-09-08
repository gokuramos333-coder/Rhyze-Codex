'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

type Item = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  classes: string[];
  referralCode: string | null;
};

export function InstructorDirectoryOrder({
  initialItems,
  action,
}: {
  initialItems: Item[];
  action: (formData: FormData) => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [dragged, setDragged] = useState<string | null>(null);

  return (
    <form action={action}>
      <input type="hidden" name="orderedIds" value={items.map((item) => item.id).join(',')} />
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.id}
            draggable
            onDragStart={() => setDragged(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!dragged || dragged === item.id) return;
              setItems((current) => {
                const next = [...current];
                const from = next.findIndex((entry) => entry.id === dragged);
                const to = next.findIndex((entry) => entry.id === item.id);
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
              });
              setDragged(null);
            }}
            className="cursor-grab border-l-4 border-rhyze-orange bg-white p-5 active:cursor-grabbing"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-rhyze-black/40">Drag to reorder</p>
            <Link href={`/admin/instructors/${item.id}`} className="mt-2 block hover:text-rhyze-coral">
              <div className="flex items-center gap-3">
                <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-rhyze-orange/30 bg-rhyze-orange/10 font-display text-2xl">
                  {item.photoUrl ? (
                    <Image
                      src={item.photoUrl}
                      alt={`${item.name} instructor photo`}
                      fill
                      sizes="56px"
                      className="object-cover object-top"
                    />
                  ) : (
                    item.name.slice(0, 1)
                  )}
                </div>
                <div className="min-w-0">
                  <strong className="block font-display text-3xl tracking-wider">{item.name}</strong>
                  <span className="block truncate text-sm text-rhyze-black/55">{item.email}</span>
                </div>
              </div>
              <p className="mt-3 text-sm">{item.classes.length ? item.classes.join(' · ') : 'No upcoming classes assigned'}</p>
              <p className="mt-3 text-xs font-black uppercase tracking-widest text-rhyze-coral">{item.referralCode || 'Code pending'} · Edit profile →</p>
            </Link>
          </article>
        ))}
      </div>
      <button className="mt-4 bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest">Save website order</button>
    </form>
  );
}
