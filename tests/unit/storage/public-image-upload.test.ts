import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The runtime Next config is intentionally authored as ESM JavaScript.
import nextConfig from '../../../next.config.mjs';
import {
  normalizePublicImage,
  validatePublicImageMetadata,
} from '@/lib/storage/public-image';

describe('public profile image uploads', () => {
  it('allows an 8 MB phone photo through the Server Action boundary', () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe('10mb');
    expect(
      validatePublicImageMetadata({ type: 'image/heic', size: 8 * 1024 * 1024 }),
    ).toEqual({ valid: true });
  });

  it('does not import sharp at module load time so admin pages can render without native image binaries', () => {
    const source = readFileSync('lib/storage/public-image.ts', 'utf8');
    expect(source).not.toMatch(/import\s+sharp\s+from ['"]sharp['"]/);
    expect(source).toContain("await import('sharp')");
  });

  it('normalizes an uploaded image to a browser-safe JPEG', async () => {
    const png = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: '#ff7557',
      },
    }).png().toBuffer();

    const normalized = await normalizePublicImage(png);
    const metadata = await sharp(normalized).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(24);
    expect(metadata.height).toBe(16);
  });

  it('keeps member profile photos in sync with the account default image', () => {
    const memberActions = readFileSync('app/(portal)/member/actions.ts', 'utf8');
    const adminMemberActions = readFileSync(
      'app/(studio)/admin/members/[userId]/actions.ts',
      'utf8',
    );
    const adminMemberPage = readFileSync(
      'app/(studio)/admin/members/[userId]/page.tsx',
      'utf8',
    );

    expect(memberActions).toContain(
      "prisma.user.update({ where: { id: user.id }, data: { image: photoUrl } })",
    );
    expect(adminMemberActions).toContain(
      'export async function updateAdminMemberProfilePhotoAction(formData: FormData)',
    );
    expect(adminMemberActions).toContain(
      "prisma.user.update({ where: { id: userId }, data: { image: photoUrl } })",
    );
    expect(adminMemberActions).toContain('prisma.memberProfile.upsert({');
    expect(adminMemberPage).toContain(
      'action={updateAdminMemberProfilePhotoAction}',
    );
    expect(adminMemberPage).toContain(
      'Updates both the member profile photo and the default account photo used across Rhyze.',
    );
  });

  it('stores admin-added instructor photos as the unclaimed account default image', () => {
    const instructorActions = readFileSync(
      'app/(studio)/admin/instructors/actions.ts',
      'utf8',
    );

    expect(instructorActions).toContain(
      "data: { name, role: 'MEMBER', ...(photoUrl ? { image: photoUrl } : {}) }",
    );
    expect(instructorActions).toContain('image: photoUrl,');
    expect(instructorActions).toContain('image: nextPhotoUrl,');
  });
});
