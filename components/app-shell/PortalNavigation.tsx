'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export type PortalNavItem = {
  href: string;
  label: string;
  matches?: string[];
  badge?: number;
  children?: Array<{ href: string; label: string }>;
};

export function PortalNavigation({ items }: { items: PortalNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mt-8 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:min-h-0 lg:flex-1 lg:grid-cols-1 lg:overflow-y-auto lg:pr-1">
      {items.map((item) => {
        const prefixes = item.matches || [item.href];
        const active = prefixes.some(
          (prefix) =>
            pathname === prefix ||
            (prefix !== '/admin' && pathname.startsWith(`${prefix}/`)),
        );

        if (item.children?.length) {
          return (
            <details
              key={item.href}
              open={active || undefined}
              className="col-span-2 sm:col-span-3 lg:col-span-1"
            >
              <summary
                className={cn(
                  'focus-ring cursor-pointer list-none border-l-4 px-3 py-2 text-sm font-bold transition [&::-webkit-details-marker]:hidden',
                  active
                    ? 'border-rhyze-orange bg-rhyze-orange text-rhyze-black'
                    : 'border-white/10 text-rhyze-cream/60 hover:border-rhyze-coral hover:bg-rhyze-coral/10 hover:text-rhyze-cream',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  {item.label}
                  <span aria-hidden className="text-xs">⌄</span>
                </span>
              </summary>
              <div className="ml-4 grid gap-1 border-l border-white/10 py-1 pl-2">
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className="focus-ring px-3 py-2 text-sm font-bold text-rhyze-cream/60 transition hover:bg-rhyze-coral/10 hover:text-rhyze-cream"
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </details>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'focus-ring border-l-4 px-3 py-2 text-sm font-bold transition',
              active
                ? 'border-rhyze-orange bg-rhyze-orange text-rhyze-black'
                : 'border-white/10 text-rhyze-cream/60 hover:border-rhyze-coral hover:bg-rhyze-coral/10 hover:text-rhyze-cream',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              {item.label}
              {!!item.badge && item.badge > 0 && (
                <span
                  className="grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white"
                  aria-label={`${item.badge} unread ${item.badge === 1 ? 'message' : 'messages'}`}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
