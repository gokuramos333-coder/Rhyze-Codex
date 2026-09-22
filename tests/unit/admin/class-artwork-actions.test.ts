import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireArea: vi.fn(), upload: vi.fn(), deleteObject: vi.fn(), revalidate: vi.fn(),
  db: {
    user: { findFirst: vi.fn() },
    classTemplate: { findUnique: vi.fn(), update: vi.fn() },
    classOccurrence: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    classSeries: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/auth/session', () => ({ requireArea: mocks.requireArea }));
vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/storage/object-storage', () => ({ putPublicImage: mocks.upload, deleteObject: mocks.deleteObject }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { updateClassTemplateAction } from '@/app/(studio)/admin/classes/[templateId]/actions';
import { updateTemplateArtworkAction } from '@/app/(studio)/admin/classes/[templateId]/artwork-actions';
import { updateOccurrenceArtworkAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/artwork/actions';

function data(file?: File) {
  const form = new FormData();
  form.set('id', 'target');
  if (file) form.set('photo', file);
  return form;
}

describe('artwork writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireArea.mockResolvedValue({ id: 'teacher', role: 'INSTRUCTOR' });
    mocks.db.user.findFirst.mockResolvedValue({ id: 'teacher' });
    mocks.db.classTemplate.findUnique.mockResolvedValue({ imageUrl: '/shared.jpg', dropInPriceCents: 2500 });
    mocks.db.classOccurrence.findFirst.mockResolvedValue({ id: 'target', instructorId: 'teacher', imageUrl: '/override.jpg' });
    mocks.db.classOccurrence.findMany.mockResolvedValue([]);
    mocks.db.classOccurrence.updateMany.mockResolvedValue({ count: 1 });
    mocks.upload.mockResolvedValue('/api/media/profiles/new.jpg');
  });
  it('retains artwork when ordinary template edits omit image fields', async () => {
    const form = data(); form.set('dropInPrice', '25');
    await expect(updateClassTemplateAction(form)).rejects.toThrow('redirect:/admin/classes/target?saved=1');
    expect(mocks.db.classTemplate.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageUrl: '/shared.jpg' }) }));
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
  it('allows artwork-only template upload without title or description', async () => {
    expect(await updateTemplateArtworkAction(data(new File(['jpg'], 'art.jpg', { type: 'image/jpeg' })))).toEqual({ success: true });
    expect(mocks.db.classTemplate.update).toHaveBeenCalledWith({ where: { id: 'target' }, data: { imageUrl: '/api/media/profiles/new.jpg' } });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
  it('removes only the template reference, preserving shared storage', async () => {
    const form = data(); form.set('removePhoto', 'true');
    expect(await updateTemplateArtworkAction(form)).toEqual({ success: true });
    expect(mocks.db.classTemplate.update).toHaveBeenCalledWith({ where: { id: 'target' }, data: { imageUrl: null } });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
  it.each([
    ['invalid type', () => new File(['bad'], 'bad.pdf', { type: 'application/pdf' })],
    ['oversize upload', () => new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })],
  ])('rejects %s before storage or persistence', async (_label, file) => {
    expect(await updateTemplateArtworkAction(data(file()))).toHaveProperty('error');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.db.classTemplate.update).not.toHaveBeenCalled();
  });
  it('restricts instructor artwork to the exact assigned occurrence and never changes the template', async () => {
    expect(await updateOccurrenceArtworkAction(data(new File(['png'], 'art.png', { type: 'image/png' })))).toEqual({ success: true });
    expect(mocks.db.classOccurrence.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'target', instructorId: 'teacher' } }));
    expect(mocks.db.classOccurrence.updateMany).toHaveBeenCalledWith({ where: { id: 'target', instructorId: 'teacher' }, data: { imageUrl: '/api/media/profiles/new.jpg' } });
    expect(mocks.db.classTemplate.update).not.toHaveBeenCalled();
  });
  it('denies another instructor occurrence before uploading', async () => {
    mocks.db.classOccurrence.findFirst.mockResolvedValue(null);
    expect(await updateOccurrenceArtworkAction(data(new File(['jpg'], 'art.jpg', { type: 'image/jpeg' })))).toHaveProperty('error');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.db.classOccurrence.updateMany).not.toHaveBeenCalled();
  });
  it('denies inactive or unapproved instructors before querying or writing the occurrence', async () => {
    mocks.db.user.findFirst.mockResolvedValue(null);
    expect(await updateOccurrenceArtworkAction(data())).toHaveProperty('error');
    expect(mocks.db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'teacher', status: 'ACTIVE' }) }));
    expect(mocks.db.user.findFirst.mock.calls[0][0].where.instructorProfile).toEqual({ is: { isActive: true } });
    expect(mocks.db.classOccurrence.findFirst).not.toHaveBeenCalled();
    expect(mocks.db.classOccurrence.updateMany).not.toHaveBeenCalled();
  });
  it('reports reassignment during upload instead of writing another instructor occurrence', async () => {
    mocks.db.classOccurrence.updateMany.mockResolvedValue({ count: 0 });
    expect(await updateOccurrenceArtworkAction(data(new File(['jpg'], 'art.jpg', { type: 'image/jpeg' })))).toHaveProperty('error');
    expect(mocks.db.classTemplate.update).not.toHaveBeenCalled();
  });
  it('clears the occurrence override for inherited fallback without deleting shared media', async () => {
    const form = data(); form.set('removePhoto', 'true');
    expect(await updateOccurrenceArtworkAction(form)).toEqual({ success: true });
    expect(mocks.db.classOccurrence.updateMany).toHaveBeenCalledWith({ where: { id: 'target', instructorId: 'teacher' }, data: { imageUrl: null } });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
