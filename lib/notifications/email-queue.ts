import type { Prisma, PrismaClient } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

export function queueEmail(
  client: Client,
  message: {
    userId?: string;
    to: string;
    subject: string;
    template: string;
    payload?: Prisma.InputJsonValue;
    scheduledFor?: Date;
    dedupeKey?: string;
  },
) {
  return client.emailMessage.create({
    data: {
      userId: message.userId,
      to: message.to,
      subject: message.subject,
      template: message.template,
      payload: message.payload || {},
      scheduledFor: message.scheduledFor,
      dedupeKey: message.dedupeKey,
    },
  });
}
