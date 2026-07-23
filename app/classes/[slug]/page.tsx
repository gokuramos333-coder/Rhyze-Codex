import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { classes, getClass } from '@/lib/classes';

export function generateStaticParams() {
  return classes.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const c = getClass(params.slug);
  if (!c) return { title: 'Class not found' };
  return { title: c.name, description: c.tagline };
}

export default function ClassDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  redirect(`/book/${params.slug}`);
}
