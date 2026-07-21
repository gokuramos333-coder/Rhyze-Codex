'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Instagram, Phone, MapPin } from 'lucide-react';
import { site, primaryNav } from '@/lib/site';
import { Button } from '@/components/ui/Button';

export function Footer() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>(
    'idle',
  );

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
      setStatus(res.ok ? 'ok' : 'err');
      if (res.ok) setEmail('');
    } catch {
      setStatus('err');
    }
  }

  return (
    <footer className="relative border-t border-white/5 bg-rhyze-charcoal/60">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Image
            src="/brand/rhyze-logo.png"
            alt={`${site.name} logo`}
            width={112}
            height={112}
            className="h-28 w-auto"
          />
          <p className="mt-4 max-w-xs text-sm text-rhyze-cream/70">
            {site.description}
          </p>
          <div className="mt-6 flex gap-3">
            <a
              href={site.instagram.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="focus-ring rounded-full border border-white/10 p-2 transition hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href={`tel:${site.phoneTel}`}
              aria-label="Phone"
              className="focus-ring rounded-full border border-white/10 p-2 transition hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              <Phone className="h-5 w-5" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-lg tracking-widest">EXPLORE</h3>
          <ul className="space-y-2 text-sm">
            {primaryNav.map((i) => (
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
          <h3 className="mb-4 text-lg tracking-widest">VISIT</h3>
          <address className="space-y-3 text-sm not-italic text-rhyze-cream/70">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-coral" />
              <span>
                {site.address.line1}
                <br />
                {site.address.line2}
                <br />
                {site.address.line3}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-rhyze-coral" />
              <a
                href={`tel:${site.phoneTel}`}
                className="hover:text-rhyze-coral"
              >
                {site.phone}
              </a>
            </p>
            <div className="pt-2">
              {site.hours.map((h) => (
                <div key={h.days} className="flex justify-between gap-4">
                  <span className="text-rhyze-gold">{h.days}</span>
                  <span className="text-rhyze-gold">{h.hours}</span>
                </div>
              ))}
              <p className="mt-2 text-rhyze-orange">{site.hoursNote}</p>
            </div>
          </address>
        </div>

        <div>
          <h3 className="mb-4 text-lg tracking-widest">STAY IN THE RHYTHM</h3>
          <p className="mb-4 text-sm text-rhyze-cream/70">
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
              className="focus-ring rounded-full border border-white/10 bg-rhyze-black/60 px-5 py-3 text-sm placeholder:text-rhyze-cream/40"
            />
            <Button type="submit" size="sm" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Subscribe'}
            </Button>
            {status === 'ok' && (
              <p className="text-xs text-rhyze-gold">
                Thanks, see you on the floor.
              </p>
            )}
            {status === 'err' && (
              <p className="text-xs text-rhyze-coral">
                Something went wrong. Try again.
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
