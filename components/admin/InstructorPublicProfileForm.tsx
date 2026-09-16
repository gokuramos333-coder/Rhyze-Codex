'use client';

import Image from 'next/image';
import React, { useEffect, useRef, useState, useTransition } from 'react';
import {
  prepareInstructorPhoto,
  validateInstructorPhotoSource,
} from '@/lib/storage/instructor-photo-client';

type Props = {
  action: (formData: FormData) => Promise<void>;
  name: string;
  bio: string;
  currentPhotoUrl?: string | null;
  initialPhotoError?: string | null;
  userId?: string;
  submitLabel: string;
  standardClassRate?: string;
  specialtyEventRateText?: string;
  standardRateReadOnly?: boolean;
};

function fileSizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function InstructorPublicProfileForm({
  action,
  name,
  bio,
  currentPhotoUrl,
  initialPhotoError,
  userId,
  submitLabel,
  standardClassRate,
  specialtyEventRateText,
  standardRateReadOnly = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(initialPhotoError || null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setError(initialPhotoError || null);
  }, [initialPhotoError]);

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
    setRemovePhoto(false);
    setError(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set('removePhoto', removePhoto ? 'true' : 'false');
    setError(null);
    startTransition(async () => {
      try {
        if (photo) formData.set('photo', await prepareInstructorPhoto(photo));
        await action(formData);
      } catch (submissionError) {
        const digest =
          submissionError &&
          typeof submissionError === 'object' &&
          'digest' in submissionError
            ? String(submissionError.digest)
            : '';
        if (digest.startsWith('NEXT_REDIRECT')) throw submissionError;
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : 'The profile could not be saved. Please try again.',
        );
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      data-testid="instructor-public-profile-form"
      className="grid gap-4 border-t-4 border-rhyze-orange bg-white p-6 md:grid-cols-2"
    >
      {userId && <input type="hidden" name="userId" value={userId} />}
      <label className="grid gap-2">
        <Span>Public name</Span>
        <input name="name" defaultValue={name} required className="min-h-12 border bg-white px-3 text-rhyze-black" />
      </label>
      <div className="grid gap-2">
        <Span>Instructor photo</Span>
        <div
          data-testid="instructor-profile-photo-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            selectPhoto(event.dataTransfer.files[0]);
          }}
          className="border-2 border-dashed border-rhyze-orange/50 bg-rhyze-orange/10 p-4"
        >
          <input
            ref={inputRef}
            type="file"
            name="photo"
            accept=".heic,.heif,.jpeg,.jpg,.png,.webp,image/heic,image/heif,image/jpeg,image/png,image/webp"
            aria-label="Choose instructor photo"
            className="sr-only"
            onChange={(event) => selectPhoto(event.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-3">
            {currentPhotoUrl && !photo && !removePhoto && (
              <Image
                src={currentPhotoUrl}
                alt="Current instructor profile"
                width={56}
                height={56}
                unoptimized={currentPhotoUrl.startsWith('/api/media/')}
                className="h-14 w-14 object-cover"
              />
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="min-h-11 bg-rhyze-black px-4 text-xs font-black uppercase tracking-widest text-white"
            >
              {currentPhotoUrl && !removePhoto ? 'Replace photo' : 'Choose photo'}
            </button>
            {currentPhotoUrl && !photo && !removePhoto && (
              <button
                type="button"
                onClick={() => {
                  setRemovePhoto(true);
                  setError(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
                className="min-h-11 border border-red-700 bg-white px-4 text-xs font-black uppercase tracking-widest text-red-700"
              >
                Remove photo
              </button>
            )}
            <span className="text-sm font-bold text-rhyze-black/55">or drag it here</span>
          </div>
          {removePhoto && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-l-4 border-red-700 bg-red-50 p-3 text-sm font-bold text-red-700">
              <span>Photo will be removed when you save.</span>
              <button
                type="button"
                onClick={() => setRemovePhoto(false)}
                className="text-xs font-black uppercase tracking-widest underline"
              >
                Undo
              </button>
            </div>
          )}
          {photo && (
            <div className="mt-3 flex items-center justify-between gap-3 bg-white p-3 text-sm">
              <span>
                <strong className="block">{photo.name}</strong>
                <small className="text-rhyze-black/55">{fileSizeLabel(photo.size)}</small>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
                className="text-xs font-black uppercase text-rhyze-coral"
              >
                Remove
              </button>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mt-3 border-l-4 border-red-700 bg-red-50 p-3 text-sm font-bold text-red-700"
            >
              {error}
            </p>
          )}
        </div>
      </div>
      <label className="grid gap-2 md:col-span-2">
        <Span>Public bio</Span>
        <textarea name="bio" defaultValue={bio} className="min-h-48 border bg-white p-3 text-rhyze-black" />
      </label>
      {standardClassRate !== undefined && (
        <div id="pay-rates" className="grid gap-4 md:col-span-2 md:grid-cols-2">
          <label className="grid gap-2">
            <Span>Standard class pay rate</Span>
            <div className="flex min-h-12 items-center border bg-white px-3">
              <span className="mr-2 font-bold">$</span>
              <input
                name="standardClassRate"
                type="number"
                min="0"
                step="0.01"
                defaultValue={standardClassRate}
                readOnly={standardRateReadOnly}
                className="min-w-0 flex-1 outline-none read-only:cursor-not-allowed read-only:opacity-60"
              />
            </div>
          </label>
          <label className="grid gap-2">
            <Span>Specialty event pay rate</Span>
            <textarea
              name="specialtyEventRateText"
              rows={3}
              maxLength={500}
              defaultValue={specialtyEventRateText}
              placeholder="Example: 30% of net ticket sales, or $75 flat rate"
              className="border p-3"
            />
          </label>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest disabled:cursor-wait disabled:opacity-60 md:col-span-2"
      >
        {pending ? 'Preparing photo and saving…' : submitLabel}
      </button>
    </form>
  );
}

function Span({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-black uppercase tracking-widest">{children}</span>;
}
