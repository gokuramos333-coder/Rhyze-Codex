import type { PrismaClient } from '@prisma/client';
import { parseProfilePatch } from '@/lib/validation/profile';

export async function updateProfile(
  db: PrismaClient,
  userId: string,
  form: FormData,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const current = await tx.memberProfile.findUnique({ where: { userId } });
    const patch = parseProfilePatch(form, current);
    if (!Object.keys(patch).length) return;
    await tx.memberProfile.upsert({
      where: { userId },
      update: patch,
      create: { userId, ...patch },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'member.profile.updated',
        entityType: 'MemberProfile',
        entityId: userId,
        after: { fields: Object.keys(patch) },
      },
    });
  });
}
