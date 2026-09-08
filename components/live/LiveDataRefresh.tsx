'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function LiveDataRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    };
    const id = window.setInterval(refresh, intervalMs);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [intervalMs, router]);

  return null;
}
