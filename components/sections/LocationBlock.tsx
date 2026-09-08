import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Phone, Clock } from 'lucide-react';
import { site } from '@/lib/site';

export function LocationBlock() {
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.address.mapQuery)}`;

  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="mb-10 text-left md:text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Find Us
        </p>
        <h2 className="font-display text-5xl tracking-wider md:text-7xl">
          THE HOME <span className="rhyze-gradient-text">FLOOR</span>
        </h2>
      </div>

      <div className="grid overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal lg:grid-cols-5">
        <div className="p-8 md:p-10 lg:col-span-2">
          <h3 className="font-display text-3xl tracking-wider">
            RHYZE FITNESS
          </h3>
          <p className="mt-2 text-sm text-rhyze-cream/70">
            Lafayette, New Jersey
          </p>

          <div className="mt-8 space-y-5 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-rhyze-coral" />
              <div>
                <p className="font-semibold">{site.address.line1}</p>
                <p className="text-rhyze-cream/70">{site.address.line2}</p>
                <p className="text-rhyze-cream/70">{site.address.line3}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-1 h-4 w-4 shrink-0 text-rhyze-coral" />
              <a
                href={`tel:${site.phoneTel}`}
                className="hover:text-rhyze-coral"
              >
                {site.phone}
              </a>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="mt-1 h-4 w-4 shrink-0 text-rhyze-coral" />
              <div>
                {site.hours.map((h) => (
                  <p
                    key={h.days}
                    className="grid grid-cols-[4.5rem_auto] gap-x-3"
                  >
                    <span className="text-rhyze-cream/60">{h.days}</span>
                    <span className="whitespace-nowrap">{h.hours}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="focus-ring rounded-full border border-white/15 px-5 py-2 text-sm font-semibold uppercase tracking-wide hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              Get in touch →
            </Link>
            <a
              href={directionsHref}
              target="_blank"
              rel="noreferrer"
              className="focus-ring rounded-full border border-white/15 px-5 py-2 text-sm font-semibold uppercase tracking-wide hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              Get directions ↗
            </a>
          </div>
        </div>

        <div className="relative min-h-[360px] lg:col-span-3">
          <a
            href={directionsHref}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open Google directions to ${site.name}`}
            className="focus-ring group absolute inset-0 block"
          >
            <Image
              src="/reference/home-floor-map.jpeg"
              alt="Aerial directions map showing the Rhyze Fitness studio location"
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-contain transition duration-500"
            />
          </a>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-rhyze-black/60 via-transparent to-rhyze-coral/20 mix-blend-multiply"
          />
        </div>
      </div>
    </section>
  );
}
