import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ count: 0 });

  const count = await prisma.memberConversationMessage.count({
    where: {
      conversation: { memberId: userId },
      senderId: { not: userId },
      memberReadAt: null,
    },
  });
  return NextResponse.json({ count });
}
