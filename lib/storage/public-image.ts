const supportedPublicImageTypes = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const maxPublicImageBytes = 8 * 1024 * 1024;

export function validatePublicImageMetadata(file: {
  type: string;
  size: number;
}) {
  if (!supportedPublicImageTypes.has(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Use a HEIC, HEIF, JPG, PNG, or WebP image.',
    } as const;
  }
  if (file.size <= 0 || file.size > maxPublicImageBytes) {
    return { valid: false, error: 'Photo must be 8 MB or smaller.' } as const;
  }
  return { valid: true } as const;
}

async function loadSharp() {
  const mod = await import('sharp');
  return mod.default;
}

export async function normalizePublicImage(input: Buffer) {
  const sharp = await loadSharp();
  return sharp(input, { failOn: 'error' })
    .rotate()
    .resize({
      width: 1_600,
      height: 1_600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
