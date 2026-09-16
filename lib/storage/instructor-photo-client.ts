const MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_DIRECT_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PHOTO_EDGE = 1_600;

const supportedExtensions = new Set([
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'webp',
]);
const directUploadTypes = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const mimeTypeByExtension: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function validateInstructorPhotoSource(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const looksLikeImage = file.type.toLowerCase().startsWith('image/');
  if (!looksLikeImage && !supportedExtensions.has(extension)) {
    return {
      valid: false,
      error: 'Use a HEIC, HEIF, JPG, PNG, or WebP photo.',
    } as const;
  }
  if (!file.size || file.size > MAX_SOURCE_PHOTO_BYTES) {
    return {
      valid: false,
      error: 'Photo must be 25 MB or smaller.',
    } as const;
  }
  return { valid: true } as const;
}

function optimizedFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, '').trim() || 'instructor-photo';
  return `${base}.jpg`;
}

type PhotoCompressor = (file: File) => Promise<File>;

export async function prepareInstructorPhoto(
  file: File,
  compressor: PhotoCompressor = compressInstructorPhotoInBrowser,
) {
  const validation = validateInstructorPhotoSource(file);
  if (!validation.valid) throw new Error(validation.error);
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const directFile = file.type
    ? file
    : new File([file], file.name, {
        type: mimeTypeByExtension[extension] || file.type,
        lastModified: file.lastModified,
      });
  if (
    directFile.size <= MAX_DIRECT_UPLOAD_BYTES &&
    directUploadTypes.has(directFile.type)
  ) {
    return directFile;
  }
  const optimized = await compressor(directFile);
  if (!optimized.size || optimized.size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new Error('The optimized photo is still too large. Try a different photo.');
  }
  return optimized;
}

async function compressInstructorPhotoInBrowser(file: File) {
  const source = await loadImageSource(file);
  const scale = Math.min(
    1,
    MAX_PHOTO_EDGE / source.width,
    MAX_PHOTO_EDGE / source.height,
  );
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the photo.');
  context.drawImage(source.image, 0, 0, width, height);
  source.cleanup();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  if (!blob) throw new Error('This browser could not prepare the photo.');
  return new File([blob], optimizedFilename(file.name), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

async function loadImageSource(file: File): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to an HTML image for browsers without support for this format.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      'This photo format could not be opened. Export it as JPG or PNG and try again.',
    );
  }
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}
