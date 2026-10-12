// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NewsletterEditor } from '@/components/newsletters/NewsletterEditor';
import type { Bundle, Campaign } from '@/components/newsletters/types';
import { blockSchema, documentSchema } from '@/lib/newsletters/domain';

const doc = documentSchema.parse({
  version: 1,
  blocks: ['heading', 'text', 'divider'].map((type, i) =>
    blockSchema.parse({ id: String(i), type, text: 'Sample copy' }),
  ),
});
const campaign = {
  id: 'local-campaign',
  name: 'Preview only',
  subject: 'Our week',
  previewText: '',
  version: 1,
  templateType: 'CUSTOM',
  document: doc,
  scheduleMode: 'EXPLICIT',
  targetWeek: '2026-10-12',
} as Campaign;
const bundle = {
  schedule: [],
  customers: [],
  assets: [],
  week: '2026-10-12',
  capture: true,
  health: { origin: 'https://www.rhyzefitness.com' },
  settings: { postalAddress: 'Studio address' },
} as unknown as Bundle;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => ({
      ok: true,
      json: async () =>
        init
          ? { result: { ...JSON.parse(init.body), version: 2 } }
          : { customers: [], schedule: [] },
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function editor() {
  return render(
    <NewsletterEditor
      campaign={campaign}
      bundle={bundle}
      onClose={vi.fn()}
      onSaved={async () => {}}
    />,
  );
}
it.each([
  'heading',
  'text',
  'image',
  'video',
  'button',
  'columns',
  'divider',
  'schedule',
  'class',
  'event',
])('opens the added %s section immediately and saves it', async (type) => {
  editor();
  fireEvent.change(screen.getByLabelText('Add a section'), {
    target: { value: type },
  });
  const added = document.querySelectorAll('.nl-editor-block details')[3];
  expect(added).toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/newsletters',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(call[1]?.body)).document.blocks.at(-1).type).toBe(
    type,
  );
});
it('offers scheduling directly with date, time and Eastern timezone', () => {
  editor();
  fireEvent.click(screen.getByRole('button', { name: 'Schedule email' }));
  expect(screen.getByLabelText('Send date')).toHaveAttribute('type', 'date');
  expect(screen.getByLabelText('Send time')).toHaveAttribute('type', 'time');
  expect(screen.getByLabelText('Time zone')).toHaveValue('America/New_York');
});
it('offers an upload in the new image section', () => {
  editor();
  fireEvent.change(screen.getByLabelText('Add a section'), {
    target: { value: 'image' },
  });
  expect(screen.getByLabelText('Image or flyer file')).toHaveAttribute(
    'type',
    'file',
  );
});

it('preserves edits made while an image upload finishes', async () => {
  let finishUpload: (x: unknown) => void = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url, init) =>
      url === '/api/admin/newsletters/assets'
        ? new Promise((resolve) => {
            finishUpload = resolve;
          })
        : Promise.resolve({
            ok: true,
            json: async () =>
              init
                ? { result: { ...JSON.parse(init.body), version: 2 } }
                : { customers: [], schedule: [] },
          }),
    ),
  );
  editor();
  fireEvent.change(screen.getByLabelText('Add a section'), {
    target: { value: 'image' },
  });
  fireEvent.submit(
    screen.getByLabelText('Image or flyer file').closest('form')!,
  );
  fireEvent.change(screen.getByLabelText('Subject line'), {
    target: { value: 'Keep this edit' },
  });
  finishUpload({
    ok: true,
    json: async () => ({
      asset: {
        id: 'asset',
        url: '/uploads/flyer.jpg',
        alt: 'Our flyer',
        name: 'Flyer',
      },
    }),
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Image URL')).toHaveValue(
      '/uploads/flyer.jpg',
    ),
  );
  expect(screen.getByLabelText('Subject line')).toHaveValue('Keep this edit');
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/newsletters',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  const call = vi
    .mocked(fetch)
    .mock.calls.find(
      ([url, init]) =>
        url === '/api/admin/newsletters' && init?.method === 'POST',
    )!;
  const saved = JSON.parse(String(call[1]?.body));
  expect(saved.document.blocks).toHaveLength(4);
  expect(saved.document.blocks[3].url).toBe('/uploads/flyer.jpg');
  expect(saved.subject).toBe('Keep this edit');
});
