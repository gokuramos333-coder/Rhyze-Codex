import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { newsletterActor } from '@/lib/newsletters/access';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { putNewsletterImage } from '@/lib/storage/object-storage';
import { validatePublicImageMetadata } from '@/lib/storage/public-image';
import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/newsletters/repository';
export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request))
    return NextResponse.json(
      { error: 'Same-origin request required' },
      { status: 403 },
    );
  const actor = await newsletterActor();
  if (!actor)
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 },
    );
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw Error('Choose an image.');
    const valid = validatePublicImageMetadata(file);
    if (!valid.valid) throw Error(valid.error);
    const alt = String(form.get('alt') || '')
      .trim()
      .slice(0, 300);
    if (!alt) throw Error('Add image alt text.');
    const width = Math.min(
      1600,
      Math.max(320, Number(form.get('width')) || 1200),
    );
    const height = Number(form.get('height')) || 0;
    if (height && (!Number.isFinite(height) || height < 100 || height > 1600))
      throw Error('Invalid crop height.');
    const position = ['centre', 'north', 'south'].includes(
      String(form.get('position')),
    )
      ? String(form.get('position'))
      : 'centre';
    const buffer = Buffer.from(await file.arrayBuffer());
    const normalized = await sharp(buffer, { limitInputPixels: 40000000 })
      .rotate()
      .resize({
        width,
        height: height || undefined,
        fit: height ? 'cover' : 'inside',
        position,
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    const url = await putNewsletterImage(randomUUID(), normalized);
    const asset = await prisma.newsletterAsset.create({
      data: { url, name: file.name.slice(0, 200), alt, createdById: actor.id },
    });
    await audit(actor.id, 'ASSET_UPLOADED', asset.id, {});
    return NextResponse.json({ asset });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 400 },
    );
  }
}
