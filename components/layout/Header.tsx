'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu } from 'lucide-react';
import { cn } from '@/lib/cn';
import { primaryNav, site } from '@/lib/site';
import { Button } from '@/components/ui/Button';
import { MobileNav } from '@/components/layout/MobileNav';
import { CartButton } from '@/components/layout/CartButton';
import { isApprovedOwner } from '@/lib/auth/owner-access';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then((response) => response.json())
      .then((session) => {
        if (!active || !session?.user?.email) return;
        setShowAdmin(
          isApprovedOwner({
            email: session.user.email,
            role: session.user.role,
            status: session.user.status,
          }),
        );
      })
      .catch(() => setShowAdmin(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-300',
          scrolled || !isHome
            ? 'border-b border-white/5 bg-rhyze-black/85 backdrop-blur-md'
            : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between gap-3 px-4 sm:h-28 sm:px-6 lg:h-32 lg:gap-6">
          <Link
            href="/"
            aria-label={`${site.name}, Home`}
            className="focus-ring flex shrink-0 items-center gap-3 rounded-md"
          >
            <span className="relative block h-14 w-20 shrink-0 sm:h-16 sm:w-24 lg:h-24 lg:w-36">
              <Image
                src="/brand/rhyze-logo-header.png"
                alt=""
                fill
                priority
                unoptimized
                sizes="(min-width: 1024px) 144px, (min-width: 640px) 96px, 80px"
                className="object-contain"
              />
            </span>
            <span className="sr-only">{site.name}</span>
          </Link>
          <span className="hidden rounded-full border border-rhyze-gold/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-rhyze-gold xl:inline-flex">
            Rhyze Fitness
          </span>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 lg:flex"
          >
            {primaryNav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));
              if ('children' in item && item.children) {
                return (
                  <div key={item.href} className="group relative">
                    <Link
                      href={item.href}
                      className={cn(
                        'focus-ring inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide transition',
                        active
                          ? 'text-rhyze-coral'
                          : 'text-rhyze-cream hover:text-rhyze-coral',
                      )}
                    >
                      {item.label}
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                    <div className="invisible absolute left-1/2 top-full mt-1 w-48 -translate-x-1/2 rounded-lg border border-white/10 bg-rhyze-charcoal p-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="block rounded-md px-3 py-2 text-sm text-rhyze-cream/80 hover:bg-white/5 hover:text-rhyze-coral"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'focus-ring rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide transition',
                    active
                      ? 'text-rhyze-coral'
                      : 'text-rhyze-cream hover:text-rhyze-coral',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {showAdmin && (
              <Link
                href="/admin"
                className="focus-ring rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide text-rhyze-gold transition hover:text-rhyze-coral"
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <CartButton />
            <Link
              href="/sign-in"
              className="focus-ring rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide text-rhyze-cream/80 hover:text-rhyze-coral"
            >
              Member Portal
            </Link>
            <Button href="/join" size="sm">
              Join Now
            </Button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <CartButton className="p-2" />
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className="focus-ring rounded-md p-2 text-rhyze-cream"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>
      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        showAdmin={showAdmin}
      />
    </>
  );
}
