import { NextResponse } from 'next/server';
import { requireActiveUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { readPrivateDocument } from '@/lib/storage/object-storage';

export async function GET(_request: Request, { params }: { params: { credentialId: string } }) {
  const user = await requireActiveUser();
  const credential = await prisma.instructorCredential.findUnique({ where: { id: params.credentialId } });
  if (!credential || (credential.instructorId !== user.id && !['OWNER','ADMIN','MANAGER'].includes(user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const content = await readPrivateDocument(credential.storageKey);
  return new NextResponse(content, {
    headers: { 'content-type': credential.contentType, 'content-disposition': `attachment; filename="${credential.originalFilename.replaceAll('"','')}"`, 'cache-control': 'private, no-store' },
  });
}
