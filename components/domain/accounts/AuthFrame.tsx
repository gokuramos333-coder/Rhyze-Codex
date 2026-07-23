import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthFrame({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative z-[60] min-h-screen overflow-hidden bg-rhyze-cream text-rhyze-black">
      <div className="grid min-h-screen lg:grid-cols-[minmax(20rem,0.78fr)_minmax(34rem,1.22fr)]">
        <section className="relative flex min-h-72 flex-col justify-between overflow-hidden bg-rhyze-black p-7 text-rhyze-cream md:p-12 lg:min-h-screen">
          <div className="absolute inset-y-0 right-10 w-px bg-gradient-to-b from-transparent via-rhyze-coral to-transparent opacity-70" />
          <div className="absolute -right-24 top-1/3 h-64 w-64 rounded-full border border-rhyze-orange/20" />
          <Link
            href="/"
            className="focus-ring relative z-10 inline-flex w-fit items-center gap-3"
          >
            <Image
              src="/brand/rhyze-logo-header.png"
              alt=""
              width={58}
              height={58}
              className="h-14 w-14 object-contain"
            />
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.3em] text-rhyze-orange">
                Rhyze Fitness
              </span>
              <span className="font-display text-3xl tracking-wider">
                Member access
              </span>
            </span>
          </Link>

          <div className="relative z-10 max-w-lg py-12">
            <p className="text-xs font-black uppercase tracking-[0.34em] text-rhyze-gold">
              {eyebrow}
            </p>
            <h1 className="mt-5 font-display text-6xl leading-[0.92] tracking-wide md:text-8xl">
              {title}
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-rhyze-cream/68">
              {description}
            </p>
          </div>

          <p className="relative z-10 max-w-sm text-xs font-bold uppercase tracking-[0.18em] text-rhyze-cream/40">
            Lafayette, New Jersey · In rhythm we rise
          </p>
        </section>

        <section className="flex items-center px-6 py-12 md:px-12 lg:px-20">
          <div className="mx-auto w-full max-w-xl">
            {children}
            <div className="mt-8 border-t border-rhyze-black/10 pt-6 text-sm text-rhyze-black/60">
              {footer}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function AuthField({
  label,
  name,
  type = 'text',
  autoComplete,
  required = true,
  showRequiredIndicator = false,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  showRequiredIndicator?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-black/65">
        {label}
        {required && showRequiredIndicator && (
          <span className="ml-1 text-rhyze-coral" aria-hidden="true">*</span>
        )}
      </span>
      <input
        required={required}
        name={name}
        type={type}
        autoComplete={autoComplete}
        className="focus-ring min-h-14 border border-rhyze-black/20 bg-white px-4 text-base outline-none transition placeholder:text-rhyze-black/30 focus:border-rhyze-coral"
      />
    </label>
  );
}
