import { NextResponse } from 'next/server';
import { readPublicImage } from '@/lib/storage/object-storage';

export async function GET(_request: Request, props: { params: Promise<{ key: string[] }> }) {
  const params = await props.params;
  const key = params.key.join('/');
  try {
    const content = await readPublicImage(key);
    const contentType = key.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const body = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
