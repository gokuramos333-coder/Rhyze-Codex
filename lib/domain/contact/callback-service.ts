import { Prisma, type PrismaClient } from '@prisma/client';
import { callbackInputSchema, type CallbackInput } from './callback-input';
import {
  buildCallbackAvailability,
  callbackWindow,
  CALLBACK_BUFFER_MINUTES,
  CALLBACK_MINUTES,
} from './callback-availability';
import { queueEmail } from '@/lib/notifications/email-queue';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import { STUDIO_TIME_ZONE } from '@/lib/config/studio';
import { site } from '@/lib/site';

type Client = PrismaClient | Prisma.TransactionClient;
export class CallbackError extends Error {
  constructor(
    public code: 'slot_unavailable' | 'rate_limited' | 'request_conflict',
  ) {
    super(code);
  }
}

export async function getCallbackAvailability(db: Client, now = new Date()) {
  const { start, end } = callbackWindow(now);
  const buffer = CALLBACK_BUFFER_MINUTES * 60_000;
  const [studio, reserved] = await Promise.all([
    db.classOccurrence.findMany({
      where: {
        status: { not: 'CANCELLED' },
        startAt: { lt: new Date(end.getTime() + buffer) },
        endAt: { gt: new Date(start.getTime() - buffer) },
      },
      select: { startAt: true, endAt: true, status: true },
    }),
    db.callbackRequest.findMany({
      where: { startAt: { lt: end }, endAt: { gt: start } },
      select: { startAt: true, endAt: true },
    }),
  ]);
  return buildCallbackAvailability(now, studio, reserved);
}

function sameRequest(
  saved: {
    startAt: Date;
    name: string;
    email: string;
    phone: string;
    message: string;
  },
  input: CallbackInput,
) {
  return (
    saved.startAt.toISOString() === input.startAt &&
    (['name', 'email', 'phone', 'message'] as const).every(
      (key) => saved[key] === input[key],
    )
  );
}

export async function reserveCallback(
  db: PrismaClient,
  raw: CallbackInput,
  clientHash: string | null,
  now = new Date(),
) {
  const input = callbackInputSchema.parse(raw);
  try {
    return await retrySerializableTransaction(() =>
      db.$transaction(
        async (tx) => {
          const existing = await tx.callbackRequest.findUnique({
            where: { requestKey: input.requestKey },
          });
          if (existing) {
            if (!sameRequest(existing, input))
              throw new CallbackError('request_conflict');
            return existing;
          }
          const availability = await getCallbackAvailability(tx, now);
          if (
            !availability.days.some((day) => day.slots.includes(input.startAt))
          )
            throw new CallbackError('slot_unavailable');
          const since = new Date(now.getTime() - 86_400_000);
          if (
            (await tx.callbackRequest.count({
              where: { email: input.email, createdAt: { gte: since } },
            })) >= 3 ||
            (clientHash &&
              (await tx.callbackRequest.count({
                where: {
                  clientHash,
                  createdAt: { gte: new Date(now.getTime() - 3_600_000) },
                },
              })) >= 10)
          ) {
            throw new CallbackError('rate_limited');
          }
          const startAt = new Date(input.startAt);
          const label = new Intl.DateTimeFormat('en-US', {
            timeZone: STUDIO_TIME_ZONE,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          }).format(startAt);
          const email = await queueEmail(tx, {
            to: site.emails.melissa,
            replyTo: [input.email],
            subject: `Callback requested: ${label} — ${input.name}`,
            template: 'CONTACT_FORM',
            scheduledFor: now,
            dedupeKey: `callback-request:${input.requestKey}`,
            payload: {
              senderName: input.name,
              senderEmail: input.email,
              senderPhone: input.phone,
              inquiryType: 'callback',
              adminUrl: '/admin/email-archive',
              body: `Please call ${input.name} at ${input.phone} on ${label}. This is a ${CALLBACK_MINUTES}-minute callback (${STUDIO_TIME_ZONE}).${input.message ? ` Question: ${input.message}` : ''}`,
            },
          });
          // Keep the callback details readable in Admin's Email Archive even
          // while delivery is paused, unapproved, or waiting to retry. The
          // approved HTML rendering is still produced only by the sender.
          await tx.emailMessage.update({
            where: { id: email.id },
            data: {
              textBody: `${email.subject}\nEmail: ${input.email}\n${(email.payload as { body: string }).body}`,
            },
          });
          return tx.callbackRequest.create({
            data: {
              requestKey: input.requestKey,
              startAt,
              endAt: new Date(startAt.getTime() + CALLBACK_MINUTES * 60_000),
              name: input.name,
              email: input.email,
              phone: input.phone,
              message: input.message,
              clientHash,
              emailMessageId: email.id,
              createdAt: now,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    // PostgreSQL can report a unique violation before a serialization conflict.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await db.callbackRequest.findUnique({
        where: { requestKey: input.requestKey },
      });
      if (existing && sameRequest(existing, input)) return existing;
      throw new CallbackError(
        existing ? 'request_conflict' : 'slot_unavailable',
      );
    }
    throw error;
  }
}
