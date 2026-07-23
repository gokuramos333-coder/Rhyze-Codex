import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { validateUploadMetadata } from '@/lib/domain/credentials/credential-rules';

const extensionByType: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export async function putPublicImage(file: File) {
  const validation = validateUploadMetadata(file);
  if (!validation.valid || !file.type.startsWith('image/')) throw new Error(validation.error || 'Use a JPG or PNG image.');
  const filename = `${randomUUID()}.${extensionByType[file.type]}`;
  const directory = path.join(process.cwd(), 'public', 'uploads', 'profiles');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
  return `/uploads/profiles/${filename}`;
}

export async function putPrivateDocument(file: File) {
  const validation = validateUploadMetadata(file);
  if (!validation.valid) throw new Error(validation.error);
  const key = `${randomUUID()}.${extensionByType[file.type]}`;
  const directory = path.join(process.cwd(), '.storage', 'credentials');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, key), Buffer.from(await file.arrayBuffer()));
  return key;
}

export function readPrivateDocument(key: string) {
  if (!/^[a-f0-9-]+\.(pdf|jpg|png)$/.test(key)) throw new Error('Invalid storage key.');
  return readFile(path.join(process.cwd(), '.storage', 'credentials', key));
}

export async function deleteObject(keyOrUrl: string | null) {
  if (!keyOrUrl) return;
  const target = keyOrUrl.startsWith('/uploads/profiles/')
    ? path.join(process.cwd(), 'public', keyOrUrl)
    : path.join(process.cwd(), '.storage', 'credentials', keyOrUrl);
  try { await unlink(target); } catch { /* Already removed. */ }
}
