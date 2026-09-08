'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { primaryNav } from '@/lib/site';
import { Button } from '@/components/ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
  showAdmin?: boolean;
  portalHref?: string;
  portalLabel?: string;
  unreadCount?: number;
};

export function MobileNav({
  open,
  onClose,
  showAdmin = false,
  portalHref = '/sign-in',
  portalLabel = 'Log In',
  unreadCount = 0,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="drawer"
          className="fixed inset-0 z-[60] lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Primary navigation"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col overflow-y-auto bg-rhyze-charcoal p-6"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
          >
            <div className="mb-8 flex items-center justify-between">
              <span className="font-display text-3xl tracking-wider">MENU</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={onClose}
                className="focus-ring rounded-md p-2 text-rhyze-cream"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <p className="mb-4 rounded-full border border-rhyze-gold/30 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-rhyze-gold">
              Rhyze Fitness
            </p>
            <nav className="flex flex-1 flex-col gap-1">
              {primaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="focus-ring rounded-md px-3 py-4 font-display text-3xl tracking-wide hover:text-rhyze-coral"
                >
                  {item.label}
                </Link>
              ))}
              <Button href={portalHref} size="lg" onClick={onClose} className="mt-4 w-full">
                {portalLabel}
                {unreadCount > 0 && (
                  <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white" aria-label={`${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}`}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
              {showAdmin && (
                <Link
                  href="/admin"
                  onClick={onClose}
                  className="focus-ring rounded-md px-3 py-4 text-base uppercase tracking-wide text-rhyze-gold hover:text-rhyze-coral"
                >
                  Admin
                </Link>
              )}
            </nav>
            <Button href="/join" size="lg" onClick={onClose} className="mt-3 w-full">
              Join Now
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
