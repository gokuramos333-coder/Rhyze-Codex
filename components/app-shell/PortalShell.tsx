import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/(auth)/actions';

type NavItem = { href: string; label: string };

export function PortalShell({
  area,
  user,
  navigation,
  children,
}: {
  area: string;
  user: { name: string | null; email: string };
  navigation: NavItem[];
  children: ReactNode;
}) {
  return (
    <main className="relative z-[60] min-h-screen bg-[#eee9dd] text-rhyze-black">
      <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-rhyze-black p-5 text-rhyze-cream lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
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
              <span className="font-display text-3xl tracking-wider">
                {area}
              </span>
            </span>
          </Link>

          <nav className="mt-8 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="focus-ring border-l-2 border-white/10 px-3 py-2 text-sm font-bold text-rhyze-cream/60 transition hover:border-rhyze-coral hover:bg-rhyze-coral/10 hover:text-rhyze-cream"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-7 border-t border-white/10 pt-5 lg:mt-auto">
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
