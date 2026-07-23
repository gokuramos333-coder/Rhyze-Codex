import type { Prisma, PrismaClient } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

export const INSTRUCTOR_APPROVAL_RECIPIENTS = [
  'vanessa@rhyzefit.com',
  'melissa@rhyzefit.com',
] as const;

export function buildInstructorApprovalNotifications(input: {
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
}) {
  return INSTRUCTOR_APPROVAL_RECIPIENTS.map((to) => ({
    to,
    subject: `Instructor approval needed: ${input.applicantName}`,
    template: 'INSTRUCTOR_APPROVAL_NEEDED',
    payload: {
      applicantName: input.applicantName,
      applicantEmail: input.applicantEmail,
      adminPath: '/admin/instructors',
    },
    dedupeKey: `instructor-approval:${input.applicationId}:${to}`,
  }));
}

export async function queueInstructorApprovalNotifications(
  client: Client,
  input: {
    applicationId: string;
    applicantName: string;
    applicantEmail: string;
  },
) {
  await Promise.all(
    buildInstructorApprovalNotifications(input).map((message) =>
      client.emailMessage.upsert({
        where: { dedupeKey: message.dedupeKey },
        update: {},
        create: message,
      }),
    ),
  );
}
