// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstructorInviteForm } from '@/components/admin/InstructorInviteForm';
import { InstructorPublicProfileForm } from '@/components/admin/InstructorPublicProfileForm';
import { prepareInstructorPhoto } from '@/lib/storage/instructor-photo-client';

describe('InstructorInviteForm', () => {
  afterEach(() => cleanup());

  it('shows a dragged photo and submits it with the instructor details', async () => {
    const action = vi.fn(async (_formData: FormData) => undefined);
    const photo = new File(['photo'], 'avery-decker.jpg', { type: 'image/jpeg' });

    render(<InstructorInviteForm action={action} />);
    fireEvent.drop(screen.getByTestId('instructor-photo-dropzone'), {
      dataTransfer: { files: [photo] },
    });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Avery Decker' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'avery@example.com' },
    });

    expect(screen.getByText('avery-decker.jpg')).toBeVisible();
    fireEvent.submit(screen.getByTestId('instructor-invite-form'));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const submitted = action.mock.calls[0][0] as FormData;
    expect(submitted.get('name')).toBe('Avery Decker');
    expect(submitted.get('email')).toBe('avery@example.com');
    expect(submitted.get('photo')).toBe(photo);
  });

  it('shows a clear error instead of silently accepting an unusable file', () => {
    const oversized = new File(
      [new Uint8Array(25 * 1024 * 1024 + 1)],
      'avery-original.png',
      { type: 'image/png' },
    );

    render(<InstructorInviteForm action={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Choose instructor photo'), {
      target: { files: [oversized] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Photo must be 25 MB or smaller',
    );
  });
});

describe('prepareInstructorPhoto', () => {
  it('compresses a large browser photo before it reaches the server action', async () => {
    const source = new File(
      [new Uint8Array(12 * 1024 * 1024)],
      'avery-original.png',
      { type: 'image/png' },
    );
    const compressed = new File(['optimized'], 'avery-original.jpg', {
      type: 'image/jpeg',
    });
    const compressor = vi.fn(async () => compressed);

    await expect(prepareInstructorPhoto(source, compressor)).resolves.toBe(compressed);
    expect(compressor).toHaveBeenCalledWith(source);
  });

  it('sends a server-supported HEIC directly instead of asking the browser to decode it', async () => {
    const source = new File(
      [new Uint8Array(6 * 1024 * 1024)],
      'dennisse-profile.heic',
      { type: 'image/heic' },
    );
    const compressor = vi.fn();

    await expect(prepareInstructorPhoto(source, compressor)).resolves.toBe(source);
    expect(compressor).not.toHaveBeenCalled();
  });

  it('infers the HEIC content type when a dragged file has no browser MIME type', async () => {
    const source = new File(['photo'], 'dennisse-profile.heic', { type: '' });
    const compressor = vi.fn();

    const prepared = await prepareInstructorPhoto(source, compressor);

    expect(prepared.type).toBe('image/heic');
    expect(prepared.name).toBe('dennisse-profile.heic');
    expect(compressor).not.toHaveBeenCalled();
  });
});

describe('InstructorPublicProfileForm', () => {
  afterEach(() => cleanup());

  it('prepares and submits a replacement photo with the existing profile fields', async () => {
    const action = vi.fn(async (_formData: FormData) => undefined);
    const photo = new File(['photo'], 'dennisse-profile.jpg', {
      type: 'image/jpeg',
    });

    render(
      <InstructorPublicProfileForm
        action={action}
        name="Dennisse Mendoza"
        bio="Dance instructor"
        submitLabel="Save and publish profile"
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose instructor photo'), {
      target: { files: [photo] },
    });
    fireEvent.submit(screen.getByTestId('instructor-public-profile-form'));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const submitted = action.mock.calls[0][0] as FormData;
    expect(submitted.get('name')).toBe('Dennisse Mendoza');
    expect(submitted.get('bio')).toBe('Dance instructor');
    expect(submitted.get('photo')).toBe(photo);
  });

  it('shows a server photo error in red inside the photo chooser', () => {
    render(
      <InstructorPublicProfileForm
        action={vi.fn()}
        name="Dennisse Mendoza"
        bio="Dance instructor"
        submitLabel="Save and publish profile"
        initialPhotoError="Use a HEIC, HEIF, JPG, PNG, or WebP image no larger than 8 MB."
      />,
    );

    const photoChooser = screen.getByTestId('instructor-profile-photo-dropzone');
    const alert = within(photoChooser).getByRole('alert');
    expect(alert).toHaveTextContent('no larger than 8 MB');
    expect(alert).toHaveClass('text-red-700');
  });

  it('shows a client photo validation error inside the photo chooser', () => {
    const oversized = new File(
      [new Uint8Array(25 * 1024 * 1024 + 1)],
      'dennisse-profile.jpeg',
      { type: 'image/jpeg' },
    );

    render(
      <InstructorPublicProfileForm
        action={vi.fn()}
        name="Dennisse Mendoza"
        bio="Dance instructor"
        submitLabel="Save and publish profile"
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose instructor photo'), {
      target: { files: [oversized] },
    });

    expect(
      within(screen.getByTestId('instructor-profile-photo-dropzone')).getByRole(
        'alert',
      ),
    ).toHaveTextContent('Photo must be 25 MB or smaller');
  });

  it('offers to remove an existing photo and submits the removal with Save', async () => {
    const action = vi.fn(async (_formData: FormData) => undefined);
    render(
      <InstructorPublicProfileForm
        action={action}
        name="Dennisse Mendoza"
        bio="Dance instructor"
        currentPhotoUrl="/api/media/profiles/dennisse.jpg"
        submitLabel="Save and publish profile"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(screen.getByText('Photo will be removed when you save.')).toBeVisible();
    expect(screen.queryByAltText('Current instructor profile')).not.toBeInTheDocument();

    fireEvent.submit(screen.getByTestId('instructor-public-profile-form'));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(
      (action.mock.calls[0][0] as FormData).get('removePhoto'),
    ).toBe('true');
  });
});
