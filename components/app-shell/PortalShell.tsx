import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/(auth)/actions';
import {
  PortalNavigation,
  type PortalNavItem,
} from './PortalNavigation';

export function PortalShell({
  area,
  user,
  navigation,
  unreadCount = 0,
  children,
}: {
  area: string;
  user: { name: string | null; email: string };
  navigation: PortalNavItem[];
  unreadCount?: number;
  children: ReactNode;
}) {
  return (
    <main className={`relative z-[60] min-h-screen bg-[#eee9dd] text-rhyze-black ${area === 'ADMIN' ? 'admin-shell' : ''}`}>
      <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-rhyze-black p-5 text-rhyze-cream lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r">
          <Link href="/" className="focus-ring flex items-center gap-3">
            <Image
              src="/brand/rhyze-logo-header.png"
              alt=""
              width={52}
              height={52}
              className="h-12 w-12 object-contain"
            />
            <span>
              <span className="block text-[9px] font-black uppercase tracking-[0.28em] text-rhyze-orange">
                Rhyze Fitness
              </span>
              <span className="flex items-center gap-2 font-display text-3xl tracking-wider">
                {area}
                {unreadCount > 0 && (
                  <span
                    className="grid min-h-6 min-w-6 place-items-center rounded-full bg-red-600 px-1.5 font-sans text-xs font-black leading-none text-white"
                    aria-label={`${unreadCount} unread management ${unreadCount === 1 ? 'message' : 'messages'}`}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
            </span>
          </Link>

          <PortalNavigation items={navigation} />

          <div className="mt-7 shrink-0 border-t border-white/10 pt-5 lg:mt-4">
            <p className="truncate text-sm font-bold">
              {user.name || user.email}
            </p>
            <p className="mt-1 truncate text-xs text-rhyze-cream/40">
              {user.email}
            </p>
            <form action={signOutAction}>
              <button className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-rhyze-orange">
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-8 md:px-8 lg:px-10">
          {children}
        </section>
      </div>
    </main>
  );
}
