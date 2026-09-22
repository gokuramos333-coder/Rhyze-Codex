import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { assignableInstructorWhere } from '@/lib/admin/assignable-instructors';
import { prisma } from '@/lib/db/prisma';
import { ClassArtworkForm } from '@/components/admin/ClassArtworkForm';
import { resolveClassArtwork } from '@/lib/domain/schedule/class-artwork';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { updateOccurrenceArtworkAction } from './actions';

export default async function InstructorArtworkPage({ params }: { params: Promise<{ occurrenceId: string }> }) {
  const user = await requireArea('instructor');
  const instructor = await prisma.user.findFirst({
    where: { ...assignableInstructorWhere, id: user.id, instructorProfile: { is: { isActive: true } } },
    select: { id: true },
  });
  if (!instructor) notFound();
  const { occurrenceId } = await params;
  const occurrence = await prisma.classOccurrence.findFirst({
    where: { id: occurrenceId, instructorId: user.id },
    include: { template: true, instructor: { include: { instructorProfile: true } } },
  });
  if (!occurrence) notFound();
  return (
    <>
      <Link href="/instructor/schedule" className="text-xs font-black uppercase tracking-widest text-rhyze-coral">← My classes</Link>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <p className="mt-3 text-rhyze-black/55">{memberBookingDateTimeLabel(occurrence)}</p>
      <p className="mt-3 text-sm font-bold">This photo applies only to this assigned date, not other instructors’ classes.</p>
      <ClassArtworkForm id={occurrence.id} action={updateOccurrenceArtworkAction} currentPhotoUrl={occurrence.imageUrl} fallbackPhotoUrl={resolveClassArtwork({ ...occurrence, imageUrl: null })} />
    </>
  );
}
