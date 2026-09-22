// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassArtworkForm } from '@/components/admin/ClassArtworkForm';

afterEach(cleanup);
describe('class artwork controls', () => {
  it('saves a prepared photo without requiring title or description', async () => {
    const action = vi.fn().mockResolvedValue({ success: true });
    render(<ClassArtworkForm id="class" action={action} fallbackPhotoUrl="/fallback.jpg" />);
    fireEvent.change(screen.getByLabelText('Choose class or event photo'), { target: { files: [new File(['jpg'], 'new.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save artwork' }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const form = action.mock.calls[0][0] as FormData;
    expect(form.get('id')).toBe('class');
    expect((form.get('photo') as File).name).toBe('new.jpg');
    expect(form.has('name')).toBe(false);
    expect(form.has('description')).toBe(false);
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Artwork saved.');
  });
  it('shows invalid file errors below the chooser and does not submit', () => {
    const action = vi.fn();
    render(<ClassArtworkForm id="class" action={action} fallbackPhotoUrl="/fallback.jpg" />);
    fireEvent.change(screen.getByLabelText('Choose class or event photo'), { target: { files: [new File(['pdf'], 'bad.pdf', { type: 'application/pdf' })] } });
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('text-red-700');
    expect(screen.getByRole('button', { name: 'Choose photo' }).compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });
  it('rejects oversized source images before submission', () => {
    render(<ClassArtworkForm id="class" action={vi.fn()} fallbackPhotoUrl="/fallback.jpg" />);
    fireEvent.change(screen.getByLabelText('Choose class or event photo'), { target: { files: [new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' })] } });
    expect(screen.getByRole('alert').textContent).toContain('25 MB');
  });
  it('previews inherited fallback when removing and persists only removal intent', async () => {
    const action = vi.fn().mockResolvedValue({ success: true });
    render(<ClassArtworkForm id="class" action={action} currentPhotoUrl="/current.jpg" fallbackPhotoUrl="/fallback.jpg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(screen.getByRole('img').getAttribute('src')).toContain('fallback.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Save artwork' }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0][0].get('removePhoto')).toBe('true');
  });
  it('renders server upload errors inline', async () => {
    render(<ClassArtworkForm id="class" action={vi.fn().mockResolvedValue({ error: 'Upload unavailable.' })} currentPhotoUrl="/current.jpg" fallbackPhotoUrl="/fallback.jpg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save artwork' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Upload unavailable.');
  });
});
