import type { Metadata } from 'next';
import Image from 'next/image';
import { Instagram, Mail, Phone, MapPin, Clock } from 'lucide-react';
import { ContactForm } from '@/components/sections/ContactForm';
import { LocationBlock } from '@/components/sections/LocationBlock';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Reach out to Rhyze Fitness, Lafayette, NJ. Membership questions, private events, press, or just to say hi.',
};

export default function ContactPage() {
  return (
    <main className="py-20">
      <section className="mx-auto max-w-4xl px-6 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Get In Touch
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          SAY <span className="rhyze-gradient-text">HELLO</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          Got a question, an idea, or just want to say hi? We&apos;d love to
          hear from you. Whether you&apos;re booking your first class, planning
          a private event, or asking about birthday parties and corporate
          sessions. We answer every message, usually within 24 hours.
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-7xl px-6">
        <div className="grid gap-10 lg:grid-cols-5">
          <aside className="space-y-6 lg:col-span-2">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal p-8">
              <h2 className="font-display text-3xl tracking-wider">
                THE DETAILS
              </h2>
              <div className="mt-6 space-y-5 text-sm">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-coral" />
                  <div>
                    <p className="font-semibold">{site.address.line1}</p>
                    <p className="text-rhyze-cream/70">{site.address.line2}</p>
                    <p className="text-rhyze-cream/70">{site.address.line3}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-coral" />
                  <a
                    href={`tel:${site.phoneTel}`}
                    className="hover:text-rhyze-coral"
                  >
                    {site.phone}
                  </a>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-coral" />
                  <div className="space-y-1">
                    <a
                      href={`mailto:${site.emails.vanessa}`}
                      className="block hover:text-rhyze-coral"
                    >
                      {site.emails.vanessa}
                    </a>
                    <a
                      href={`mailto:${site.emails.melissa}`}
                      className="block hover:text-rhyze-coral"
                    >
                      {site.emails.melissa}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Instagram className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-coral" />
                  <a
                    href={site.instagram.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-rhyze-coral"
                  >
                    {site.instagram.handle}
                  </a>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-coral" />
                  <div className="space-y-1">
                    {site.hours.map((h) => (
                      <p key={h.days} className="flex gap-3">
                        <span className="w-20 text-rhyze-gold">
                          {h.days}
                        </span>
                        <span className="text-rhyze-gold">{h.hours}</span>
                      </p>
                    ))}
                    <p className="text-rhyze-orange">{site.hoursNote}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl">
              <Image
                src="/founders/founders-vanessa-melissa-3.jpg"
                alt="Vanessa and Melissa at Rhyze Fitness"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-rhyze-black/70 via-transparent to-transparent" />
              <p className="absolute bottom-5 left-5 font-display text-2xl tracking-wider">
                SEE YOU ON THE FLOOR
              </p>
            </div>
          </aside>

          <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-8 lg:col-span-3">
            <h2 className="mb-6 font-display text-3xl tracking-wider">
              DROP A NOTE
            </h2>
            <ContactForm />
          </div>
        </div>
      </section>

      <LocationBlock />
    </main>
  );
}
