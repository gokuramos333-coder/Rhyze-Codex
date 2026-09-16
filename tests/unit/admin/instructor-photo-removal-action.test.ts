import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  profileFindUnique: vi.fn(),
  putPublicImage: vi.fn(),
  revalidatePath: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`);
  },
}));
vi.mock('@/lib/auth/session', () => ({
  requireArea: async () => ({
    id: 'instructor_1',
    email: 'dennisse@example.com',
    role: 'INSTRUCTOR',
  }),
  requireApprovedOwner: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    instructorProfile: { findUnique: mocks.profileFindUnique },
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));
vi.mock('@/lib/storage/object-storage', () => ({
  deleteObject: mocks.deleteObject,
  putPublicImage: mocks.putPublicImage,
}));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
vi.mock('@/lib/domain/accounts/account-claim-service', () => ({
  issueAccountClaim: vi.fn(),
}));
vi.mock('@/lib/domain/accounts/prisma-account-claim-repository', () => ({
  prismaAccountClaimRepository: {},
}));

import { updateOwnInstructorDirectoryAction } from '@/app/(portal)/instructor/profile/actions';
import { updateInstructorDirectoryAction } from '@/app/(studio)/admin/instructors/actions';

describe('instructor profile photo removal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileFindUnique.mockResolvedValue({
      photoUrl: '/api/media/profiles/dennisse-old.jpg',
      canEditOwnProfile: true,
    });
    mocks.userFindUnique.mockResolvedValue({ email: 'dennisse@example.com' });
    mocks.userUpdate.mockResolvedValue({});
  });

  it('lets an admin clear the instructor and account photos and deletes the stored image', async () => {
    const formData = new FormData();
    formData.set('userId', 'instructor_1');
    formData.set('name', 'Dennisse Mendoza');
    formData.set('bio', 'Dance instructor');
    formData.set('removePhoto', 'true');

    await expect(updateInstructorDirectoryAction(formData)).rejects.toThrow(
      'redirect:/admin/instructors/instructor_1?saved=profile',
    );

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'instructor_1' },
      data: expect.objectContaining({
        image: null,
        instructorProfile: {
          upsert: {
            create: expect.objectContaining({ photoUrl: null }),
            update: expect.objectContaining({ photoUrl: null }),
          },
        },
      }),
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      '/api/media/profiles/dennisse-old.jpg',
    );
  });

  it('lets an instructor clear the public and account photos and deletes the stored image', async () => {
    const formData = new FormData();
    formData.set('name', 'Dennisse Mendoza');
    formData.set('bio', 'Dance instructor');
    formData.set('removePhoto', 'true');

    await expect(updateOwnInstructorDirectoryAction(formData)).rejects.toThrow(
      'redirect:/instructor/profile?saved=profile',
    );

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'instructor_1' },
      data: {
        name: 'Dennisse Mendoza',
        image: null,
        instructorProfile: {
          update: { bio: 'Dance instructor', photoUrl: null },
        },
      },
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      '/api/media/profiles/dennisse-old.jpg',
    );
  });

  it('preserves the existing photo when the admin saves without removing or replacing it', async () => {
    const formData = new FormData();
    formData.set('userId', 'instructor_1');
    formData.set('name', 'Dennisse Mendoza');
    formData.set('bio', 'Dance instructor');

    await expect(updateInstructorDirectoryAction(formData)).rejects.toThrow(
      'redirect:/admin/instructors/instructor_1?saved=profile',
    );

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'instructor_1' },
      data: expect.objectContaining({
        image: '/api/media/profiles/dennisse-old.jpg',
        instructorProfile: {
          upsert: {
            create: expect.objectContaining({
              photoUrl: '/api/media/profiles/dennisse-old.jpg',
            }),
            update: expect.objectContaining({
              photoUrl: '/api/media/profiles/dennisse-old.jpg',
            }),
          },
        },
      }),
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
