import { PrismaClient, Role } from '@prisma/client';
import { hashPassword, validatePassword } from '../lib/auth/password';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!email || !password) {
    console.info(
      'Skipping owner seed. Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD to create one.',
    );
    return;
  }

  const validation = validatePassword(password);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  await prisma.user.upsert({
    where: { email },
    update: { role: Role.OWNER, status: 'ACTIVE' },
    create: {
      email,
      passwordHash: await hashPassword(password),
      role: Role.OWNER,
      notificationPreference: { create: {} },
      memberProfile: { create: {} },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
