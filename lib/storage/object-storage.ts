import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getStore } from '@netlify/blobs';
import { validateUploadMetadata } from '@/lib/domain/credentials/credential-rules';
import {
  resolveStorageConfig,
  type StorageConfig,
} from '@/lib/storage/storage-config';
import {
  normalizePublicImage,
  validatePublicImageMetadata,
} from '@/lib/storage/public-image';

const extensionByType: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function netlifyStore() {
  return getStore({ name: 'rhyze-uploads', consistency: 'strong' });
}

export async function putPublicImage(file: File) {
  const validation = validatePublicImageMetadata(file);
  if (!validation.valid) throw new Error(validation.error);
  const key = `profiles/${randomUUID()}.jpg`;
  const normalized = await normalizePublicImage(
    Buffer.from(await file.arrayBuffer()),
  );
  await putObject(key, 'image/jpeg', normalized);
  return `/api/media/${key}`;
}

export async function putClassGalleryImage(file: File) {
  const validation = validateUploadMetadata(file);
  if (!validation.valid || !file.type.startsWith('image/')) {
    throw new Error(validation.error || 'Use a JPG or PNG image.');
  }
  const key = `classes-gallery/${randomUUID()}.${extensionByType[file.type]}`;
  await putObject(key, file.type, Buffer.from(await file.arrayBuffer()));
  return `/api/media/${key}`;
}

export async function putPrivateDocument(file: File) {
  const validation = validateUploadMetadata(file);
  if (!validation.valid) throw new Error(validation.error);
  const key = `credentials/${randomUUID()}.${extensionByType[file.type]}`;
  await putObject(key, file.type, Buffer.from(await file.arrayBuffer()));
  return key;
}

export function readPrivateDocument(key: string) {
  if (
    !/^credentials\/[a-f0-9-]+\.(pdf|jpg|png)$/.test(key) &&
    !/^[a-f0-9-]+\.(pdf|jpg|png)$/.test(key)
  ) {
    throw new Error('Invalid storage key.');
  }
  return readObject(key);
}

export function readPublicImage(key: string) {
  if (!/^(profiles|classes-gallery)\/[a-f0-9-]+\.(jpg|png)$/.test(key)) {
    throw new Error('Invalid public media key.');
  }
  return readObject(key);
}

export async function deleteObject(keyOrUrl: string | null) {
  if (!keyOrUrl) return;
  const key = keyOrUrl.startsWith('/api/media/')
    ? keyOrUrl.slice('/api/media/'.length)
    : keyOrUrl;
  if (key.startsWith('/uploads/profiles/')) {
    try {
      await unlink(path.join(process.cwd(), 'public', key));
    } catch {
      // Legacy local upload was already removed.
    }
    return;
  }

  const config = resolveStorageConfig();
  if (config.driver === 'netlify') {
    await netlifyStore().delete(key);
    return;
  }
  if (config.driver === 's3') {
    await s3Client(config).send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return;
  }
  try {
    await unlink(localObjectPath(key));
  } catch {
    // Object was already removed.
  }
}

let cachedS3Client: S3Client | null = null;

function s3Client(config: Extract<StorageConfig, { driver: 's3' }>) {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return cachedS3Client;
}

function localObjectPath(key: string) {
  if (/^[a-f0-9-]+\.(pdf|jpg|png)$/.test(key)) {
    return path.join(process.cwd(), '.storage', 'credentials', key);
  }
  return path.join(process.cwd(), '.storage', 'objects', key);
}

async function putObject(key: string, contentType: string, body: Buffer) {
  const config = resolveStorageConfig();
  if (config.driver === 'netlify') {
    const content = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer;
    await netlifyStore().set(key, content, { metadata: { contentType } });
    return;
  }
  if (config.driver === 's3') {
    await s3Client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }

  const target = localObjectPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

async function readObject(key: string): Promise<Buffer> {
  const config = resolveStorageConfig();
  if (config.driver === 'netlify') {
    const value = await netlifyStore().get(key, {
      type: 'arrayBuffer',
      consistency: 'strong',
    });
    if (!value) throw new Error('Stored object was not found.');
    return Buffer.from(value);
  }
  if (config.driver === 's3') {
    const response = await s3Client(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!response.Body) throw new Error('Stored object is empty.');
    return Buffer.from(await response.Body.transformToByteArray());
  }
  return readFile(localObjectPath(key));
}
