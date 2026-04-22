'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Input,
  Textarea,
  Select,
  Label,
  FieldError,
} from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  name: z.string().min(1, 'Please share your name'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().optional(),
  subject: z.enum(['general', 'membership', 'private-event', 'press']),
  message: z.string().min(5, 'Tell us a little more'),
});

type Values = z.infer<typeof schema>;

export function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>(
    'idle',
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { subject: 'general' },
  });

  const onSubmit = async (values: Values) => {
    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error();
      setStatus('ok');
      reset();
    } catch {
      setStatus('err');
    }
  };

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
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            {...register('phone')}
          />
        </div>
        <div>
          <Label htmlFor="subject" required>
            Subject
          </Label>
          <Select id="subject" {...register('subject')}>
            <option value="general">General</option>
            <option value="membership">Membership</option>
            <option value="private-event">Private Event</option>
            <option value="press">Press</option>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="message" required>
          Message
        </Label>
        <Textarea
          id="message"
          rows={5}
          error={!!errors.message}
          {...register('message')}
        />
        <FieldError message={errors.message?.message} />
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send Message →'}
        </Button>
        {status === 'ok' && (
          <p className="text-sm text-rhyze-gold">
            Got it — we&apos;ll be in touch soon.
          </p>
        )}
        {status === 'err' && (
          <p className="text-sm text-rhyze-coral">
            Something broke on our end. Email hello@rhyzefit.com and
            we&apos;ll get you sorted.
          </p>
        )}
      </div>
    </form>
  );
}
