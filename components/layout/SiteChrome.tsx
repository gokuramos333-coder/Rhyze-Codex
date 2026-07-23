'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { CartDrawer } from '@/components/sections/CartDrawer';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { usesStudioChrome } from '@/lib/site-chrome';

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const studioChrome = usesStudioChrome(pathname);

  if (studioChrome) {
    return <div id="content">{children}</div>;
  }

  return (
    <>
      <Header />
      <div id="content" className="pt-44">
        {children}
      </div>
      <Footer />
      <CartDrawer />
    </>
  );
}
