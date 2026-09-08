'use client';

import React, { useRef, useState, useTransition } from 'react';
import {
  prepareInstructorPhoto,
  validateInstructorPhotoSource,
} from '@/lib/storage/instructor-photo-client';

type Props = {
  action: (formData: FormData) => Promise<void>;
};

function fileSizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function InstructorInviteForm({ action }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectPhoto = (file: File | undefined) => {
    if (!file) return;
    const validation = validateInstructorPhotoSource(file);
    if (!validation.valid) {
      setPhoto(null);
      setError(validation.error);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setPhoto(file);
    setError(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        if (photo) {
          formData.set('photo', await prepareInstructorPhoto(photo));
        }
        await action(formData);
      } catch (submissionError) {
        const digest = submissionError && typeof submissionError === 'object'
          && 'digest' in submissionError
          ? String(submissionError.digest)
          : '';
        if (digest.startsWith('NEXT_REDIRECT')) throw submissionError;
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : 'The instructor invitation could not be created. Please try again.',
        );
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      data-testid="instructor-invite-form"
      className="mt-8 grid gap-4 border-t-4 border-rhyze-orange bg-white p-6 md:grid-cols-2"
    >
      <Field name="name" label="Full name" required />
      <Field name="email" label="Email" type="email" required />
      <div className="grid gap-2 md:col-span-2">
        <span className="text-xs font-black uppercase tracking-widest">
          Instructor photo <span className="text-rhyze-black/40">(optional)</span>
        </span>
        <div
          data-testid="instructor-photo-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            selectPhoto(event.dataTransfer.files[0]);
          }}
          className="rounded-lg border-2 border-dashed border-rhyze-orange/50 bg-rhyze-orange/10 p-5"
        >
          <input
            ref={inputRef}
            id="instructor-photo"
            type="file"
            accept=".heic,.heif,.jpeg,.jpg,.png,.webp,image/heic,image/heif,image/jpeg,image/png,image/webp"
            aria-label="Choose instructor photo"
            className="sr-only"
            onChange={(event) => selectPhoto(event.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="min-h-11 bg-rhyze-black px-5 text-xs font-black uppercase tracking-widest text-white"
            >
              Choose photo
            </button>
            <p className="text-sm font-bold text-rhyze-black/60">
              or drag the photo into this box
            </p>
          </div>
          {photo && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-white p-3 text-sm">
              <div>
                <strong className="block">{photo.name}</strong>
                <span className="text-rhyze-black/55">
                  {fileSizeLabel(photo.size)} · large photos optimize automatically
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
                className="text-xs font-black uppercase tracking-widest text-rhyze-coral"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
      <label className="grid gap-2 md:col-span-2">
        <span className="text-xs font-black uppercase tracking-widest">
          Public bio <span className="text-rhyze-black/40">(optional)</span>
        </span>
        <textarea name="bio" className="min-h-28 border p-3" />
      </label>
      <p className="text-sm font-bold text-rhyze-black/55 md:col-span-2">
        Bio and photo can be added later. The instructor stays private until
        they enter the code and management approves them.
      </p>
      {error && (
        <p role="alert" className="border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-3 text-sm font-bold md:col-span-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest disabled:cursor-wait disabled:opacity-60 md:col-span-2"
      >
        {pending ? 'Preparing photo and creating invitation…' : 'Create and email instructor invitation'}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="min-h-12 border px-3"
      />
    </label>
  );
}
