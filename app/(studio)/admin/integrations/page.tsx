import Link from 'next/link';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { stripeIsConfigured } from '@/lib/payments/stripe';

const integrations = [
  {
    name: 'Stripe',
    configured: stripeIsConfigured(),
    description: 'Subscriptions, one-time purchases, saved cards, refunds, invoices, and payment webhooks.',
    href: '/admin/payments',
  },
  {
    name: 'Resend',
    configured: Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL),
    description: 'Contact delivery, transactional email, reminders, and campaign delivery.',
    href: '/admin/messages',
  },
  {
    name: 'PostgreSQL',
    configured: Boolean(process.env.DATABASE_URL),
    description: 'Member accounts, bookings, attendance, products, imported Somble history, and reports.',
    href: '/admin/reports',
  },
  {
    name: 'Twilio SMS',
    configured: false,
    description: 'Optional SMS reminders are planned after email delivery is live.',
    href: '/admin/settings',
  },
] as const;

export default function AdminIntegrationsPage() {
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Connected services</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">INTEGRATIONS</h1>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {integrations.map((item) => (
          <Link href={item.href} key={item.name} className="border-t-4 border-rhyze-orange bg-white p-6 hover:border-rhyze-coral">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-4xl tracking-wider">{item.name}</h2>
              {item.configured ? <CheckCircle2 className="text-emerald-600" /> : <CircleAlert className="text-rhyze-coral" />}
            </div>
            <p className="mt-3 text-sm font-bold text-rhyze-black/50">{item.description}</p>
            <p className={`mt-4 text-xs font-black uppercase ${item.configured ? 'text-emerald-700' : 'text-rhyze-coral'}`}>{item.configured ? 'Configured' : 'Not configured'}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
