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
    cc?: string[];
    bcc?: string[];
    replyTo?: string[];
    threadId?: string;
    attachments?: Array<{
      filename: string;
      contentType: string;
      content: Buffer;
      contentDisposition?: string;
      contentId?: string;
    }>;
  },
) {
  const create = {
    user: message.userId ? { connect: { id: message.userId } } : undefined,
    to: message.to,
    toList: [message.to],
    cc: message.cc || [],
    bcc: message.bcc || [],
    replyTo: message.replyTo || [],
    subject: message.subject,
    template: message.template,
    payload: message.payload || {},
    scheduledFor: message.scheduledFor,
    dedupeKey: message.dedupeKey,
    threadId: message.threadId,
    attachments: message.attachments?.length
      ? {
          create: message.attachments.map((attachment) => ({
            filename: attachment.filename,
            contentType: attachment.contentType,
            contentDisposition: attachment.contentDisposition,
            contentId: attachment.contentId,
            content: new Uint8Array(attachment.content),
            size: attachment.content.length,
          })),
        }
      : undefined,
  } satisfies Prisma.EmailMessageCreateInput;
  if (message.dedupeKey) {
    return client.emailMessage.upsert({
      where: { dedupeKey: message.dedupeKey },
      update: {},
      create,
    });
  }
  return client.emailMessage.create({
    data: create,
  });
}
