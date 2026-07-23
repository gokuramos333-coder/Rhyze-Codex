'use client';

import { useEffect } from 'react';
import { useCart } from '@/lib/cart';

export function ClearCart() {
  const clear = useCart((state) => state.clear);
  useEffect(() => clear(), [clear]);
  return null;
}
