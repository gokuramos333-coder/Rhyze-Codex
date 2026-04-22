'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(7, 'A phone we can reach you at'),
  startDate: z.string().min(1, 'Pick a date'),
  waiver: z.literal(true, {
    errorMap: () => ({ message: 'Please agree to the waiver to continue' }),
  }),
});

type Values = z.infer<typeof schema>;

export function JoinForm() {
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: Values) => {
    // TODO: Integrate booking system (Mindbody / Arketa / Momence)
    await new Promise((r) => setTimeout(r, 500));
    console.info('[join] trial signup:', values);
    setDone(true);
  };

  if (done) {
    return (
      <div className="rounded-3xl border border-rhyze-gold/30 bg-rhyze-gold/5 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-rhyze-gold" />
        <h3 className="font-display text-3xl tracking-wider">
          YOU&apos;RE ON THE LIST
        </h3>
        <p className="mt-3 text-rhyze-cream/80">
          Thanks for joining the Rhyze Tribe. We&apos;ll be in touch with your
          trial details and opening-week schedule shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="name" required>
            Name
          </Label>
          <Input
            id="name"
            autoComplete="name"
            error={!!errors.name}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="email" required>
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            error={!!errors.email}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="phone" required>
            Phone
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            error={!!errors.phone}
            {...register('phone')}
          />
          <FieldError message={errors.phone?.message} />
        </div>
        <div>
          <Label htmlFor="startDate" required>
            Preferred start date
          </Label>
          <Input
            id="startDate"
            type="date"
            error={!!errors.startDate}
            {...register('startDate')}
          />
          <FieldError message={errors.startDate?.message} />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-rhyze-black/40 p-4 text-sm">
        <input
          type="checkbox"
          className="focus-ring mt-1 h-4 w-4 accent-rhyze-coral"
          {...register('waiver')}
        />
        <span className="text-rhyze-cream/80">
          I&apos;ve read and agree to the Rhyze Fitness{' '}
          <Link
            href="/policies"
            className="font-semibold text-rhyze-coral underline underline-offset-4 hover:text-rhyze-gold"
          >
            studio policies and waiver
          </Link>
          .
        </span>
      </label>
      <FieldError message={errors.waiver?.message} />

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting…' : 'Claim My $7 Week →'}
      </Button>
      <p className="text-center text-[11px] uppercase tracking-widest text-rhyze-cream/50">
        Unlimited classes · Cancel anytime · First 7 days
      </p>
    </form>
  );
}
