// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstructorInviteForm } from '@/components/admin/InstructorInviteForm';
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
      [new Uint8Array(6 * 1024 * 1024)],
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
});
