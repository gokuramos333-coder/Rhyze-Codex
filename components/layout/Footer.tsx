'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Instagram, Phone, MapPin } from 'lucide-react';
import { site, primaryNav } from '@/lib/site';
import { Button } from '@/components/ui/Button';

const footerNav = primaryNav;

export function Footer() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>(
    'idle',
  );
  const [statusMessage, setStatusMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = (await res.json()) as { message?: string };
      setStatus(res.ok ? 'ok' : 'err');
      setStatusMessage(result.message ?? '');
      if (res.ok) setEmail('');
    } catch {
      setStatus('err');
      setStatusMessage('Newsletter signup is temporarily unavailable.');
    }
  }

  return (
    <footer className="relative border-t border-white/5 bg-rhyze-charcoal/80">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1.25fr_1.25fr]">
        <div>
          <Image
            src="/brand/rhyze-logo-header.png"
            alt={`${site.name} logo`}
            width={902}
            height={643}
            unoptimized
            className="h-24 w-auto"
          />
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-rhyze-cream/70">
            A boutique dance, yoga, and HIIT studio opening in Lafayette, NJ.
            Elevate your energy. Rhyze together.
          </p>
          <div className="mt-7 flex gap-3">
            <a
              href={site.instagram.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="focus-ring rounded-full border border-white/15 p-3 text-rhyze-cream/80 transition hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href={`tel:${site.phoneTel}`}
              aria-label="Phone"
              className="focus-ring rounded-full border border-white/15 p-3 text-rhyze-cream/80 transition hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              <Phone className="h-5 w-5" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="mb-5 font-display text-2xl tracking-widest">
            EXPLORE
          </h3>
          <ul className="space-y-2.5 text-sm">
            {footerNav.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  className="focus-ring rounded text-rhyze-cream/70 hover:text-rhyze-coral"
                >
                  {i.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/policies"
                className="focus-ring rounded text-rhyze-cream/70 hover:text-rhyze-coral"
              >
                Policies
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-5 font-display text-2xl tracking-widest">VISIT</h3>
          <address className="space-y-5 text-sm not-italic text-rhyze-cream/70">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-orange" />
              <span>
                {site.address.line1}
                <br />
                {site.address.line2}
                <br />
                {site.address.line3}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-rhyze-orange" />
              <a
                href={`tel:${site.phoneTel}`}
                className="hover:text-rhyze-coral"
              >
                {site.phone}
              </a>
            </p>
            <div className="grid gap-1 pt-1 text-rhyze-gold">
              {site.hours.map((h) => (
                <div key={h.days} className="flex justify-between gap-5">
                  <span>{h.days}</span>
                  <span>{h.hours}</span>
                </div>
              ))}
              <p className="pt-2 text-rhyze-gold">
                Varies depending on the scheduled classes
              </p>
            </div>
          </address>
        </div>

        <div>
          <h3 className="mb-5 font-display text-2xl tracking-widest">
            STAY IN THE RHYTHM
          </h3>
          <p className="mb-6 max-w-xs text-sm leading-relaxed text-rhyze-cream/70">
            Drop your email for opening updates, class schedules, and
            member-only events.
          </p>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="focus-ring rounded-full border border-white/10 bg-rhyze-black/60 px-5 py-3.5 text-sm placeholder:text-rhyze-cream/40"
            />
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={status === 'sending'}
            >
              {status === 'sending' ? 'Sending…' : 'Subscribe'}
            </Button>
            {status === 'ok' && (
              <p className="text-xs text-rhyze-gold">
                {statusMessage || 'Thanks, see you on the floor.'}
              </p>
            )}
            {status === 'err' && (
              <p className="text-xs text-rhyze-coral">
                {statusMessage || 'Something went wrong. Try again.'}
              </p>
            )}
          </form>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-rhyze-cream/50 md:flex-row">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <p>Lafayette, NJ · {site.instagram.handle}</p>
        </div>
      </div>
    </footer>
  );
}
