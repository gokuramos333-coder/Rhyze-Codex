import { revalidatePath } from 'next/cache';

export function revalidateArtwork() {
  for (const path of ['/', '/classes', '/schedule', '/events', '/admin/classes', '/admin/events', '/instructor/schedule']) {
    revalidatePath(path);
  }
  for (const path of ['/book/[slug]', '/book/event/[slug]', '/events/[slug]', '/admin/classes/[templateId]', '/instructor/classes/[occurrenceId]/artwork']) {
    revalidatePath(path, 'page');
  }
}
