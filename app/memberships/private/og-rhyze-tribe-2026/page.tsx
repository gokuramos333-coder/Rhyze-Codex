import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/Button';
import { prisma } from '@/lib/db/prisma';
import { PRIVATE_OG_RHYZE_SLUG } from '@/lib/catalog/private-membership';
import { isProductActiveInWindow } from '@/lib/catalog/product-availability';

export const metadata: Metadata = {
  title: 'OG Rhyze Tribe — Private Membership',
  robots: { index: false, follow: false },
};

const benefits = [
  '8 standard class credits per month',
  'Auto-renews monthly',
  'Specialty events and workshops excluded',
  'Unique member promo code for 15% off Rhyze merchandise',
  'Credits do not roll over',
];

export default async function PrivateOgMembershipPage() {
  const [session, product] = await Promise.all([
    auth(),
    prisma.product.findUnique({ where: { slug: PRIVATE_OG_RHYZE_SLUG } }),
  ]);
  if (!product || product.isPublic || !isProductActiveInWindow(product)) notFound();

  const destination = `/member/membership?privatePlan=${encodeURIComponent(PRIVATE_OG_RHYZE_SLUG)}#available-plans`;
  const href = session?.user?.id
    ? destination
    : `/sign-in?callbackUrl=${encodeURIComponent(destination)}`;

  return (
    <main className="min-h-screen px-6 py-28">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-rhyze-gold/40 bg-rhyze-charcoal shadow-glow">
        <div className="h-2 bg-rhyze-gradient" />
        <div className="p-8 md:p-12">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-gold">Private member invitation</p>
          <h1 className="mt-4 font-display text-6xl tracking-wider md:text-8xl">OG Rhyze Tribe</h1>
          <p className="mt-5 max-w-xl text-lg text-rhyze-cream/75">Founding-community access with the same studio privileges as Ritual and twice the monthly class credits.</p>
          <div className="mt-8 flex items-end gap-3">
            <strong className="font-display text-7xl">$92</strong>
            <span className="pb-3 text-rhyze-cream/60">per month</span>
          </div>
          <p className="mt-2 text-sm font-black uppercase tracking-widest text-rhyze-orange">8 standard class credits per month</p>
          <ul className="mt-8 grid gap-3 text-rhyze-cream/80">
            {benefits.map((detail) => (
              <li key={detail} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-rhyze-gold" aria-hidden />{detail}</li>
            ))}
          </ul>
          <Button href={href} size="lg" className="mt-10 w-full">
            {session?.user?.id ? 'Continue to secure checkout' : 'Log in or create your account'}
          </Button>
          <p className="mt-4 text-center text-xs text-rhyze-cream/45">This invitation is private and is not shown in the public membership list.</p>
        </div>
      </section>
    </main>
  );
}
