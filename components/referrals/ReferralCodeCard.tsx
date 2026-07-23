'use client';

import { useState } from 'react';

export function ReferralCodeCard({ code, origin }: { code: string; origin: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  }
  const link = `${origin}/sign-up?ref=${encodeURIComponent(code)}`;
  return (
    <section className="border-t-4 border-rhyze-coral bg-white p-6">
      <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">My referral code</p>
      <p className="mt-3 font-display text-5xl tracking-wider">{code}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={() => copy(code, 'code')} className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest text-white">{copied === 'code' ? 'Code copied!' : 'Copy code'}</button>
        <button onClick={() => copy(link, 'link')} className="border border-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest">{copied === 'link' ? 'Link copied!' : 'Copy referral link'}</button>
      </div>
      <p className="mt-3 break-all text-xs text-rhyze-black/45">{link}</p>
    </section>
  );
}
