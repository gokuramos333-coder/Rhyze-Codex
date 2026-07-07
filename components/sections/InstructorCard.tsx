import Image from 'next/image';
import { Instagram, Mail, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Instructor } from '@/lib/instructors';

type Props = {
  instructor: Instructor;
  reverse?: boolean;
};

export function InstructorCard({ instructor: i, reverse }: Props) {
  return (
    <article
      className={cn(
        'grid gap-10 overflow-hidden rounded-3xl border border-white/10 bg-rhyze-charcoal p-6 md:p-10 lg:grid-cols-2 lg:items-center',
        reverse && 'lg:[&>*:first-child]:order-2',
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-rhyze-black/40">
        <Image
          src={i.photo}
          alt={`${i.firstName} ${i.lastName}, instructor at Rhyze Fitness`}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain"
        />
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          {i.role}
        </p>
        {i.descriptor && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-rhyze-gold">
            {i.descriptor}
          </p>
        )}
        <h2 className="font-display text-5xl leading-none tracking-wider md:text-7xl">
          {i.firstName.toUpperCase()}
          <br />
          {i.lastName.toUpperCase()}
        </h2>

        {i.quote && (
          <blockquote className="mt-6 border-l-2 border-rhyze-coral pl-5 text-lg italic leading-relaxed text-rhyze-gold md:text-xl">
            &ldquo;{i.quote}&rdquo;
          </blockquote>
        )}

        <p className="mt-6 whitespace-pre-line text-rhyze-cream/80">{i.bio}</p>
        {i.bioIsPlaceholder && (
          <p className="mt-3 text-xs uppercase tracking-widest text-rhyze-cream/40">
            Full bio coming soon
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-white/5 pt-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60">
            <Sparkles className="h-4 w-4 text-rhyze-gold" aria-hidden />
            {i.specialties.join(' · ')}
          </div>
          {i.instagram && (
            <a
              href={`https://instagram.com/${i.instagram}`}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              <Instagram className="h-3.5 w-3.5" aria-hidden />@{i.instagram}
            </a>
          )}
          {i.email && (
            <a
              href={`mailto:${i.email}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {i.email}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
