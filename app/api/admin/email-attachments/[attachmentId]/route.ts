import { NextResponse } from 'next/server';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export async function GET(_request: Request, props: { params: Promise<{ attachmentId: string }> }) {
  const params = await props.params;
  await requireApprovedOwner();
  const attachment = await prisma.emailAttachment.findUnique({
    where: { id: params.attachmentId },
  });
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filename = attachment.filename.replaceAll('"', '').replace(/[\r\n]/g, '');
  const content = Buffer.from(attachment.content);
  const body = content.buffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      'content-type': attachment.contentType,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
