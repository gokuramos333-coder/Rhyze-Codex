'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { primaryNav } from '@/lib/site';
import { Button } from '@/components/ui/Button';

type Props = { open: boolean; onClose: () => void };

export function MobileNav({ open, onClose }: Props) {
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
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-rhyze-charcoal p-6"
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
              <Link
                href="/signin"
                onClick={onClose}
                className="focus-ring mt-2 rounded-md px-3 py-4 text-base uppercase tracking-wide text-rhyze-cream/70 hover:text-rhyze-coral"
              >
                Sign In
              </Link>
            </nav>
            <Button href="/join" size="lg" className="w-full">
              Start $7 Trial →
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
