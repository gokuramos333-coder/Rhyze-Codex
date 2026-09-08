import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { renderTransactionalEmail } from '../lib/notifications/email-content';

const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.emailMessage.findMany({
    where: { OR: [{ textBody: null }, { htmlBody: null }] },
  });
  for (const message of messages) {
    const content = renderTransactionalEmail({
      subject: message.subject,
      template: message.template,
      payload: message.payload as Record<string, unknown>,
    });
    await prisma.emailMessage.update({
      where: { id: message.id },
      data: {
        textBody: message.textBody || content.text,
        htmlBody: message.htmlBody || content.html,
        toList: message.toList.length ? message.toList : [message.to],
        threadId: message.threadId || message.id,
      },
    });
  }
  console.log(JSON.stringify({ backfilled: messages.length }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
