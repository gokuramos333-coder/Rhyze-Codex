'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, Phone } from 'lucide-react';
import { Input, Label, Textarea } from '@/components/ui/Input';
import {
  callbackDateKey,
  type CallbackAvailability,
} from '@/lib/domain/contact/callback-availability';
import { STUDIO_TIME_ZONE } from '@/lib/config/studio';
import { site } from '@/lib/site';

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
const dayLabel = (date: string, year = false) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(year ? { year: 'numeric' as const } : {}),
  }).format(new Date(`${date}T12:00:00Z`));
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00Z`));
function adjacentMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function CallbackScheduler() {
  const [availability, setAvailability] = useState<CallbackAvailability | null>(
    null,
  );
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<{
    startAt: string;
    notification: string;
  } | null>(null);
  const requestRef = useRef<{ key: string; fingerprint: string } | null>(null);
  const fetchController = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    fetchController.current?.abort();
    const controller = new AbortController();
    fetchController.current = controller;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/contact/callback', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Availability unavailable');
      const data: CallbackAvailability = await response.json();
      if (controller.signal.aborted) return;
      const first =
        data.days.find((item) => item.slots.length)?.date ||
        data.days[0]?.date ||
        '';
      setAvailability(data);
      setDay((current) =>
        data.days.some((item) => item.date === current && item.slots.length)
          ? current
          : first,
      );
      setMonth((current) => current || first.slice(0, 7));
    } catch {
      if (!controller.signal.aborted) setLoadError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => fetchController.current?.abort();
  }, [load]);
  useEffect(() => {
    if (saved) resultRef.current?.focus();
  }, [saved]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot || submitting.current || !event.currentTarget.reportValidity())
      return;
    const form = new FormData(event.currentTarget);
    const values = {
      startAt: slot,
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
      message: String(form.get('message') || ''),
      website: String(form.get('website') || ''),
    };
    const fingerprint = JSON.stringify(values);
    if (!requestRef.current || requestRef.current.fingerprint !== fingerprint)
      requestRef.current = { key: crypto.randomUUID(), fingerprint };
    submitting.current = true;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/contact/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, requestKey: requestRef.current.key }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (data.error === 'slot_unavailable') {
          setSlot('');
          await load();
        }
        throw new Error(
          data.message || 'We could not save your request. Please try again.',
        );
      }
      setSaved({ startAt: data.startAt, notification: data.notification });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'We could not save your request. Please try again.',
      );
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  const daysInMonth = month
    ? new Date(`${adjacentMonth(month, 1)}-01T12:00Z`).getTime() -
      new Date(`${month}-01T12:00Z`).getTime()
    : 0;
  const offset = month ? new Date(`${month}-01T12:00Z`).getUTCDay() : 0;
  const selectedDay = availability?.days.find((item) => item.date === day);
  const dayMap = new Map(
    availability?.days.map((item) => [item.date, item.slots]),
  );
  const firstMonth = availability?.days[0]?.date.slice(0, 7) || '';
  const lastMonth = availability?.days.at(-1)?.date.slice(0, 7) || '';
  const iconButton =
    'focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rhyze-gold/40 text-rhyze-gold transition hover:bg-rhyze-gold/10 disabled:cursor-not-allowed disabled:opacity-25';

  return (
    <section
      id="callback"
      aria-labelledby="callback-heading"
      className="mx-auto mt-16 max-w-7xl scroll-mt-28 px-6"
    >
      <div className="overflow-hidden rounded-[1.75rem] border border-rhyze-gold/30 bg-rhyze-charcoal/70">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 p-6 md:p-8">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-rhyze-gold">
              A little guidance. A fresh start.
            </p>
            <h2
              id="callback-heading"
              className="font-display text-4xl tracking-wider md:text-5xl"
            >
              LET&apos;S TALK <span className="rhyze-gradient-text">RHYZE</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-rhyze-cream/75">
              New here? Pick a time for a friendly call about classes,
              memberships, or your first visit. We&apos;ll call you.
            </p>
          </div>
          <div className="flex gap-4 text-xs font-bold text-rhyze-cream/80">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-rhyze-orange" />
              15 minutes
            </span>
            <span className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-rhyze-orange" />
              Free callback
            </span>
          </div>
        </div>

        {saved ? (
          <div
            ref={resultRef}
            tabIndex={-1}
            role="status"
            className="p-8 outline-none md:p-12"
          >
            <Check className="mb-4 h-9 w-9 text-rhyze-gold" />
            <h3 className="font-display text-4xl tracking-wide">
              Your callback is scheduled
            </h3>
            <p className="mt-3 text-lg text-rhyze-gold">
              {dayLabel(callbackDateKey(new Date(saved.startAt)))} at{' '}
              {timeLabel(saved.startAt)} Eastern · 15 minutes
            </p>
            <p className="mt-4 max-w-2xl text-rhyze-cream/80">
              {saved.notification === 'sent'
                ? 'Our team has been notified. We’ll call the phone number you provided. No account or payment is needed.'
                : 'Your time is saved, but the email notification is still pending. Please call us if you need to confirm or your callback is soon.'}
            </p>
            <p className="mt-5 text-sm text-rhyze-cream/70">
              Need to change your request? Call{' '}
              <a
                className="text-rhyze-gold underline"
                href={`tel:${site.phoneTel}`}
              >
                {site.phone}
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1.2fr_1fr]">
            <div className="min-w-0 p-5 md:p-8 lg:border-r lg:border-white/10">
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-rhyze-gold">
                01 / Choose your day & time
              </p>
              <p className="mb-5 text-xs leading-relaxed text-rhyze-cream/65">
                All times are Eastern (New Jersey). Callbacks start at 9:00 AM
                every day. Available within the next 30 days, with at least one
                hour&apos;s notice. Class and event times, plus a 15-minute
                buffer, are excluded.
              </p>
              {loading && (
                <p role="status" className="py-4 text-sm text-rhyze-gold">
                  Checking available times…
                </p>
              )}
              {loadError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rhyze-coral/40 p-4 text-sm"
                >
                  <p>
                    We couldn&apos;t load the calendar. You can still call{' '}
                    <a className="underline" href={`tel:${site.phoneTel}`}>
                      {site.phone}
                    </a>
                    .
                  </p>
                  <button
                    type="button"
                    className="focus-ring mt-3 font-bold text-rhyze-gold underline"
                    onClick={() => void load()}
                  >
                    Try again
                  </button>
                </div>
              )}
              {availability && month && (
                <div
                  aria-busy={loading}
                  className={
                    loading || loadError ? 'pointer-events-none opacity-40' : ''
                  }
                >
                  <div className="mb-5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-label="Previous month"
                      className={iconButton}
                      disabled={
                        month <= firstMonth || sending || loading || loadError
                      }
                      onClick={() => setMonth(adjacentMonth(month, -1))}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h3
                      aria-live="polite"
                      className="text-center font-display text-2xl tracking-wide sm:text-3xl"
                    >
                      {monthLabel(month)}
                    </h3>
                    <button
                      type="button"
                      aria-label="Next month"
                      className={iconButton}
                      disabled={
                        month >= lastMonth || sending || loading || loadError
                      }
                      onClick={() => setMonth(adjacentMonth(month, 1))}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(
                      (weekday) => (
                        <span
                          key={weekday}
                          className="pb-2 text-xs font-bold uppercase text-rhyze-cream/45"
                        >
                          {weekday}
                        </span>
                      ),
                    )}
                    {Array.from({ length: offset }, (_, index) => (
                      <span aria-hidden="true" key={`blank-${index}`} />
                    ))}
                    {Array.from(
                      { length: Math.round(daysInMonth / 86_400_000) },
                      (_, index) => {
                        const date = `${month}-${String(index + 1).padStart(2, '0')}`;
                        const slots = dayMap.get(date) || [];
                        const selected = day === date;
                        return (
                          <button
                            key={date}
                            type="button"
                            aria-label={`${dayLabel(date, true)}${slots.length ? ', available' : ', unavailable'}`}
                            aria-pressed={selected}
                            disabled={
                              !slots.length || sending || loading || loadError
                            }
                            onClick={() => {
                              setDay(date);
                              setSlot('');
                              setError('');
                            }}
                            className={`focus-ring relative h-11 rounded-lg text-sm font-bold transition ${selected ? 'bg-gradient-to-r from-rhyze-orange to-rhyze-gold text-rhyze-black' : 'text-rhyze-cream hover:bg-white/10 disabled:text-rhyze-cream/20 disabled:hover:bg-transparent'}`}
                          >
                            {index + 1}
                            {slots.length > 0 && !selected && (
                              <span
                                aria-hidden="true"
                                className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-rhyze-gold"
                              />
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                  <div className="mt-7 border-t border-white/10 pt-5">
                    <p className="mb-4 text-sm font-bold">
                      {day ? dayLabel(day) : 'No available times'}
                    </p>
                    {selectedDay?.slots.length ? (
                      <div
                        className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4"
                        aria-label="Available callback times"
                      >
                        {selectedDay.slots.map((time) => (
                          <button
                            key={time}
                            type="button"
                            aria-pressed={slot === time}
                            disabled={sending || loading || loadError}
                            onClick={() => {
                              setSlot(time);
                              setError('');
                            }}
                            className={`focus-ring min-h-11 rounded-lg border px-2 py-2 text-xs font-bold transition ${slot === time ? 'border-rhyze-gold bg-rhyze-gold text-rhyze-black' : 'border-white/20 bg-rhyze-black/40 hover:border-rhyze-gold/60'}`}
                          >
                            {timeLabel(time)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-rhyze-cream/65">
                        No times are open for this day. Choose another day or
                        call us at {site.phone}.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={submit}
              className="min-w-0 border-t border-white/10 p-5 md:p-8 lg:border-t-0"
            >
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-rhyze-gold">
                02 / How can we reach you?
              </p>
              <div
                className="mb-6 rounded-xl border border-rhyze-gold/20 bg-rhyze-black/40 p-4 text-sm"
                aria-live="polite"
              >
                {slot ? (
                  <>
                    <p className="font-bold text-rhyze-gold">{dayLabel(day)}</p>
                    <p className="mt-1">
                      {timeLabel(slot)} Eastern · 15 minutes
                    </p>
                  </>
                ) : (
                  <p className="text-rhyze-cream/65">
                    Choose a day and time to get started.
                  </p>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="callback-name" required>
                    Your name
                  </Label>
                  <Input
                    id="callback-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    disabled={sending}
                  />
                </div>
                <div>
                  <Label htmlFor="callback-email" required>
                    Email address
                  </Label>
                  <Input
                    id="callback-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    disabled={sending}
                  />
                </div>
                <div>
                  <Label htmlFor="callback-phone" required>
                    Phone number
                  </Label>
                  <Input
                    id="callback-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    maxLength={30}
                    placeholder="(973) 555-0123"
                    disabled={sending}
                  />
                  <p className="mt-1 text-xs text-rhyze-cream/50">
                    Include your area code. This is the number we&apos;ll call.
                  </p>
                </div>
                <div>
                  <Label htmlFor="callback-message">
                    What would you like to know? (optional)
                  </Label>
                  <Textarea
                    id="callback-message"
                    name="message"
                    rows={3}
                    className="min-h-[90px]"
                    maxLength={2000}
                    disabled={sending}
                  />
                </div>
                <div hidden aria-hidden="true">
                  <label htmlFor="callback-website">Website</label>
                  <input
                    id="callback-website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
              </div>
              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-rhyze-coral/40 bg-rhyze-coral/10 p-3 text-sm text-rhyze-cream"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!slot || sending || loading || loadError}
                className="focus-ring mt-6 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-rhyze-coral via-rhyze-orange to-rhyze-gold px-5 py-3 text-sm font-black uppercase tracking-wider text-rhyze-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? 'Saving your time…' : 'Request callback'}
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-3 text-xs leading-relaxed text-rhyze-cream/55">
                Your contact details will be used to respond to this inquiry. No
                account or purchase necessary.
              </p>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
