import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClassBookingDetail } from '@/components/sections/ClassBookingDetail';
import { classes, getClass } from '@/lib/classes';

export function generateStaticParams() {
  return classes.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const cls = getClass(params.slug);
  if (!cls) return { title: 'Class not found' };

  return { title: cls.name, description: cls.tagline };
}

export default function ClassDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const cls = getClass(params.slug);
  if (!cls) notFound();

  return <ClassBookingDetail cls={cls} />;
}
