import { notFound } from 'next/navigation';
import Link from 'next/link';
import { updateClassTemplateAction } from './actions';
import { ClassArtworkForm } from '@/components/admin/ClassArtworkForm';
import { resolveClassArtwork } from '@/lib/domain/schedule/class-artwork';
import { updateTemplateArtworkAction } from './artwork-actions';
import { prisma } from '@/lib/db/prisma';
import { UpcomingClassEditor } from '@/components/admin/UpcomingClassEditor';
import {
  occurrenceInstructorName,
  occurrenceTitle,
  occurrenceLocalTimeZone,
  occurrenceLocalInputValue,
} from '@/lib/domain/schedule/occurrence-management';
import { resolveScheduleOccurrenceRange } from '@/lib/admin/schedule-occurrence-range';
import {
  assignableInstructorWhere,
  dedupeAssignableInstructors,
  instructorOptionLabel,
} from '@/lib/admin/assignable-instructors';
export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const now = new Date();
  const [item, instructors, categories] = await Promise.all([
    prisma.classTemplate.findUnique({
      where: { id: templateId },
      include: {
        occurrences: {
          where: { archivedAt: null },
          orderBy: { startAt: 'asc' },
          include: {
            instructor: { select: { name: true, instructorProfile: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: assignableInstructorWhere,
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.classCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  if (!item) notFound();
  const upcoming = item.occurrences.filter(
    (o) => o.status === 'SCHEDULED' && o.startAt > now,
  );
  const history = item.occurrences
    .filter((o) => !upcoming.includes(o))
    .sort((a, b) => +b.startAt - +a.startAt);
  const format = (date: Date) =>
    date.toLocaleString('en-US', {
      timeZone: occurrenceLocalTimeZone(),
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  const week = resolveScheduleOccurrenceRange({ range: 'week' }, now, 'week');
  return (
    <>
      <Link
        href="/admin/classes#edit-a-class"
        className="text-sm font-bold underline"
      >
        ← Back to classes
      </Link>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">
        Edit scheduled classes
      </p>
      <h1 className="mt-2 font-display text-5xl tracking-wide">
        {upcoming[0]
          ? occurrenceTitle({ ...upcoming[0], template: item })
          : item.name}
      </h1>
      <p className="mt-3 max-w-3xl text-black/65">
        Choose the dates you want to update, then make your changes in one
        place. Your past schedule stays intact.
      </p>
      <UpcomingClassEditor
        templateId={item.id}
        weekEnd={week.end.toISOString()}
        nowLabel={format(now)}
        nowLocal={occurrenceLocalInputValue(now)}
        defaults={{
          title: item.name,
          publicNotes: item.description,
          imageUrl: item.imageUrl || '',
          durationMinutes: String(item.durationMinutes),
          capacity: String(item.defaultCapacity),
          price: ((item.dropInPriceCents ?? 2500) / 100).toFixed(2),
        }}
        instructors={dedupeAssignableInstructors(instructors).map((i) => ({
          id: i.id,
          name: instructorOptionLabel(i),
        }))}
        dates={upcoming.map((o) => ({
          id: o.id,
          updatedAt: o.updatedAt.toISOString(),
          startAt: o.startAt.toISOString(),
          endAt: o.endAt.toISOString(),
          title: occurrenceTitle({ ...o, template: item }),
          instructor: occurrenceInstructorName(o),
          instructorId: o.instructorId,
          capacity: o.capacity,
          priceCents: o.priceCents ?? item.dropInPriceCents ?? 2500,
          publicNotes: o.publicNotes,
          imageUrl: o.imageUrl,
        }))}
      />
      <details className="mt-8 border-t border-black/15 bg-white/60 p-5">
        <summary className="cursor-pointer font-bold">
          Advanced class-format settings & artwork
        </summary>
        <p className="mt-3 border-l-4 border-rhyze-orange bg-orange-50 p-4 text-sm">
          These settings belong to the whole class format, not your selected
          dates. Description, category and artwork are shared with past dates
          too. Use the editor above for changes that must leave past classes
          untouched.
        </p>
        <form
          action={updateClassTemplateAction}
          className="mt-8 grid gap-4 border-t-4 border-rhyze-coral bg-white p-6 md:grid-cols-2"
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="name" value={item.name} />
          <p className="text-sm md:col-span-2">
            Format: <strong>{item.name}</strong>. To change scheduled class
            names, use the date selector above.
          </p>
          <label className="grid gap-2">
            <Span>Category</Span>
            <select
              name="categoryId"
              defaultValue={item.categoryId}
              className="min-h-12 border px-3"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            name="durationMinutes"
            label="Duration"
            type="number"
            value={String(item.durationMinutes)}
          />
          <Field
            name="defaultCapacity"
            label="Capacity"
            type="number"
            value={String(item.defaultCapacity)}
          />
          <Field
            name="dropInPrice"
            label="Drop-in price"
            type="number"
            value={String((item.dropInPriceCents || 2500) / 100)}
            min="1"
            step="0.01"
          />
          <label className="grid gap-2">
            <Span>Intensity</Span>
            <select
              name="intensity"
              defaultValue={item.intensity}
              className="min-h-12 border px-3"
            >
              {['LOW', 'MODERATE', 'HIGH', 'ALL_LEVELS'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Field
            name="equipment"
            label="Equipment (comma separated)"
            value={item.equipment.join(', ')}
          />
          <label className="grid gap-2 md:col-span-2">
            <Span>Description</Span>
            <textarea
              name="description"
              defaultValue={item.description}
              required
              className="min-h-28 border p-3"
            />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <Span>Cancellation policy</Span>
            <textarea
              name="cancellationPolicy"
              defaultValue={item.cancellationPolicy || ''}
              className="border p-3"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={item.isActive}
            />{' '}
            Active
          </label>
          <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">
            Save shared format settings
          </button>
        </form>
        <ClassArtworkForm
          id={item.id}
          action={updateTemplateArtworkAction}
          currentPhotoUrl={item.imageUrl}
          fallbackPhotoUrl={resolveClassArtwork({
            instructor: item.occurrences[0]?.instructor,
          })}
        />
      </details>
      <details className="mt-8 border-t border-black/15 bg-white/60 p-5">
        <summary className="cursor-pointer font-bold">
          Past & cancelled dates · {history.length} · view only
        </summary>
        <p className="mt-3 text-sm text-black/60">
          Most recent first. These dates cannot be selected for future changes.
        </p>
        <div className="mt-4 max-h-96 divide-y overflow-y-auto">
          {history.map((o) => (
            <div key={o.id} className="py-3 text-sm">
              <strong>{format(o.startAt)}</strong>
              <p>
                {occurrenceTitle({ ...o, template: item })} ·{' '}
                {occurrenceInstructorName(o)} ·{' '}
                {o.status.toLowerCase().replaceAll('_', ' ')}
              </p>
              <Link
                href={`/admin/schedule/${o.id}/roster`}
                className="font-bold underline"
              >
                View attendance
              </Link>
            </div>
          ))}
          {!history.length && <p>No past dates.</p>}
        </div>
      </details>
    </>
  );
}

function Span({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-black uppercase tracking-widest">
      {children}
    </span>
  );
}
function Field({
  name,
  label,
  value,
  type = 'text',
  required = true,
  min,
  step,
}: {
  name: string;
  label: string;
  value: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <label className="grid gap-2">
      <Span>{label}</Span>
      <input
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        min={min}
        step={step}
        className="min-h-12 border px-3"
      />
    </label>
  );
}
