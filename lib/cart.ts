'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from './products';

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  price: number;
  image: string | null;
  size: string;
  qty: number;
};

type CartStore = {
  items: CartItem[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (product: Product, size: string) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
};

function keyFor(product: Product, size: string) {
  return `${product.id}::${size}`;
}

export const useCart = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      add: (product, size) =>
        set((state) => {
          const id = keyFor(product, size);
          const existing = state.items.find((i) => i.id === id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === id ? { ...i, qty: i.qty + 1 } : i,
              ),
              isOpen: true,
            };
          }
          return {
            items: [
              ...state.items,
              {
                id,
                productId: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
                size,
                qty: 1,
              },
            ],
            isOpen: true,
          };
        }),
      remove: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      setQty: (id, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => i.id !== id)
              : state.items.map((i) => (i.id === id ? { ...i, qty } : i)),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: 'rhyze-cart' },
  ),
);

export const cartCount = (items: CartItem[]) =>
  items.reduce((n, i) => n + i.qty, 0);

export const cartTotal = (items: CartItem[]) =>
  items.reduce((n, i) => n + i.qty * i.price, 0);
