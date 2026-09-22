'use client';

import Image from 'next/image';
import React, { useRef, useState, useTransition } from 'react';
import { prepareInstructorPhoto, validateInstructorPhotoSource } from '@/lib/storage/instructor-photo-client';
import type { ArtworkResult } from '@/lib/domain/schedule/artwork-upload';

type Props = {
  id: string;
  action: (formData: FormData) => Promise<ArtworkResult>;
  currentPhotoUrl?: string | null;
  fallbackPhotoUrl: string;
};

export function ClassArtworkForm({ id, action, currentPhotoUrl, fallbackPhotoUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const previewUrl = removePhoto ? fallbackPhotoUrl : currentPhotoUrl || fallbackPhotoUrl;

  function selectPhoto(file?: File) {
    if (!file) return;
    setSaved(false);
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
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo && !removePhoto) {
      setError('Choose a photo before saving.');
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set('removePhoto', String(removePhoto));
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        if (photo) formData.set('photo', await prepareInstructorPhoto(photo));
        const result = await action(formData);
        if ('error' in result) { setError(result.error); return; }
        setPhoto(null);
        setRemovePhoto(false);
        if (inputRef.current) inputRef.current.value = '';
        setSaved(true);
      } catch (submissionError) {
        if (submissionError && typeof submissionError === 'object' && 'digest' in submissionError && String(submissionError.digest).startsWith('NEXT_REDIRECT')) throw submissionError;
        setError(submissionError instanceof Error ? submissionError.message : 'The artwork could not be saved. Try again.');
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-4 border-t-4 border-rhyze-orange bg-white p-6">
      <input type="hidden" name="id" value={id} />
      <h2 className="font-display text-4xl tracking-wider">CLASS / EVENT PHOTO</h2>
      <p className="text-sm text-rhyze-black/55">Upload artwork for this class or event. Removing it restores the inherited photo.</p>
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!pending) selectPhoto(event.dataTransfer.files[0]); }} className="border-2 border-dashed border-rhyze-orange/50 bg-rhyze-orange/10 p-4">
        <input ref={inputRef} type="file" name="photo" accept=".heic,.heif,.jpeg,.jpg,.png,.webp,image/heic,image/heif,image/jpeg,image/png,image/webp" aria-label="Choose class or event photo" className="sr-only" disabled={pending} onChange={(event) => selectPhoto(event.target.files?.[0])} />
        <div className="flex flex-wrap items-center gap-3">
          <Image src={previewUrl} alt="Class or event artwork preview" width={112} height={84} unoptimized={previewUrl.startsWith('/api/media/')} className="h-20 w-28 object-cover" />
          <button type="button" disabled={pending} onClick={() => inputRef.current?.click()} className="min-h-11 bg-rhyze-black px-4 text-xs font-black uppercase tracking-widest text-white">{currentPhotoUrl && !removePhoto ? 'Replace photo' : 'Choose photo'}</button>
          {currentPhotoUrl && !removePhoto && <button type="button" disabled={pending} onClick={() => { setRemovePhoto(true); setPhoto(null); setError(null); setSaved(false); if (inputRef.current) inputRef.current.value = ''; }} className="min-h-11 border border-red-700 bg-white px-4 text-xs font-black uppercase tracking-widest text-red-700">Remove photo</button>}
          <span className="text-sm font-bold text-rhyze-black/55">or drag it here</span>
        </div>
        {removePhoto && <p className="mt-3 text-sm font-bold">Photo will be removed when you save. <button type="button" onClick={() => setRemovePhoto(false)} disabled={pending} className="underline">Undo</button></p>}
        {photo && <p className="mt-3 text-sm font-bold">Selected: {photo.name}</p>}
        {error && <p role="alert" className="mt-3 border-l-4 border-red-700 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending} className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest disabled:cursor-wait disabled:opacity-60">{pending ? 'Preparing photo and saving…' : 'Save artwork'}</button>
      {saved && <p role="status" className="text-sm font-bold">Artwork saved.</p>}
    </form>
  );
}
