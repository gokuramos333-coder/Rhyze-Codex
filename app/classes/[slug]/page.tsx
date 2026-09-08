import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { classes, getClass } from '@/lib/classes';

export function generateStaticParams() {
  return classes.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(
  props: {
    params: Promise<{ slug: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const c = getClass(params.slug);
  if (!c) return { title: 'Class not found' };
  return { title: c.name, description: c.tagline };
}

export default async function ClassDetailPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  redirect(`/book/${params.slug}`);
}
