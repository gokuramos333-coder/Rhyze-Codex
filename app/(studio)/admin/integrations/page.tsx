import Link from 'next/link';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { stripeAccountMode, stripeConfiguration } from '@/lib/payments/stripe';

export default function AdminIntegrationsPage() {
  const stripe = stripeConfiguration();
  const integrations = [
  {
    name: 'Stripe',
    configured: stripe.checkout && stripe.webhooks,
    description: `Checkout: ${stripe.checkout ? 'ready' : 'missing key'} · Webhooks: ${stripe.webhooks ? 'ready' : 'missing secret'} · Customer portal: ${stripe.portal ? 'ready' : 'not ready'} · Mode: ${stripeAccountMode()}`,
    href: 'https://dashboard.stripe.com/',
  },
  {
    name: 'Resend',
    configured: Boolean(
      process.env.RESEND_API_KEY
      && process.env.RESEND_RECEIVING_API_KEY
      && process.env.EMAIL_FROM
      && process.env.RESEND_WEBHOOK_SECRET
      && process.env.RESEND_INBOUND_DOMAIN
    ),
    description: `Sending credentials: ${process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? 'ready' : 'missing sending key/from address'} · Automated delivery: ${process.env.EMAIL_DELIVERY_ENABLED === 'true' ? 'enabled' : 'safely paused'} · Permanent receiving archive: ${process.env.RESEND_RECEIVING_API_KEY && process.env.RESEND_WEBHOOK_SECRET && process.env.RESEND_INBOUND_DOMAIN ? 'ready' : 'missing full-access receiving key/webhook secret/inbound domain'}.`,
    href: 'https://resend.com/webhooks',
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
    href: 'https://console.twilio.com/',
  },
] as const;
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Connected services</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">INTEGRATIONS</h1>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {integrations.map((item) => (
          <Link
            href={item.href}
            key={item.name}
            target={item.href.startsWith('https://') ? '_blank' : undefined}
            rel={item.href.startsWith('https://') ? 'noreferrer' : undefined}
            className="border-t-4 border-rhyze-orange bg-white p-6 hover:border-rhyze-coral"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-4xl tracking-wider">{item.name}</h2>
              {item.configured ? <CheckCircle2 className="text-emerald-600" /> : <CircleAlert className="text-rhyze-coral" />}
            </div>
            <p className="mt-3 text-sm font-bold text-rhyze-black/50">{item.description}</p>
            <p className={`mt-4 text-xs font-black uppercase ${item.configured ? 'text-emerald-700' : 'text-rhyze-coral'}`}>{item.configured ? 'Configured · Open dashboard →' : 'Not configured · Open setup →'}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
