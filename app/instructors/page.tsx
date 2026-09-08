import type { Metadata } from 'next';
import { instructors } from '@/lib/instructors';
import { InstructorCard } from '@/components/sections/InstructorCard';
import { Button } from '@/components/ui/Button';
import { prisma } from '@/lib/db/prisma';
import type { Instructor } from '@/lib/instructors';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Instructors',
  description:
    'Meet the dance, yoga, strength, and fitness instructors of Rhyze Fitness in Lafayette, NJ.',
};

export default async function InstructorsPage() {
  const directoryProfiles = await prisma.instructorProfile.findMany({
    where: { isActive: true },
    include: { user: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const published: Instructor[] = [];
  const normalizeInstructorName = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/adrianna/g, 'adriana')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const publishedNames = new Set<string>();
  for (const profile of directoryProfiles) {
    const names = (profile.user.name || 'Rhyze Instructor').trim().split(/\s+/);
    const fullName = normalizeInstructorName(profile.user.name || '');
    const base = instructors.find((item) =>
      item.email === profile.user.email ||
      normalizeInstructorName(`${item.firstName} ${item.lastName}`) === fullName,
    );
    if (!base && !profile.photoUrl) continue;
    const instructor: Instructor = base
      ? {
          ...base,
          firstName: names[0] || base.firstName,
          lastName: names.slice(1).join(' '),
          bio: profile.bio || base.bio,
          photo: profile.photoUrl || base.photo,
        }
      : {
          slug: profile.user.id,
          firstName: names[0],
          lastName: names.slice(1).join(' '),
          role: 'Rhyze Instructor',
          photo: profile.photoUrl || '/brand/rhyze-logo-header.png',
          bio: profile.bio || 'Instructor profile details are coming soon.',
          bioIsPlaceholder: !profile.bio,
          specialties: ['Movement', 'Community'],
          email: profile.user.email.endsWith('@rhyze.local') ? undefined : profile.user.email,
        };
    const dedupeName = normalizeInstructorName(`${instructor.firstName} ${instructor.lastName}`);
    if (publishedNames.has(dedupeName)) continue;
    publishedNames.add(dedupeName);
    published.push(instructor);
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-20">
      <section className="mb-16 text-left md:text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          The Team
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          YOUR <span className="rhyze-gradient-text">RHYZE</span> CREW
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          Meet the instructors bringing dance, yoga, strength, and high-energy
          movement to the Rhyze floor.
        </p>
      </section>

      <div className="flex flex-col gap-10">
        {published.map((i, idx) => (
          <InstructorCard key={i.slug} instructor={i} reverse={idx % 2 === 1} />
        ))}
      </div>

      <section className="mt-20 rounded-3xl border border-white/10 bg-rhyze-charcoal p-10 text-center">
        <h2 className="font-display text-4xl tracking-wider md:text-5xl">
          JOIN THE RHYZE CREW
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-rhyze-cream/70">
          We&apos;re building a roster of passionate instructors to join us on
          the floor. Think you&apos;d be a great fit for the Rhyze crew?
        </p>
        <div className="mt-8">
          <Button href="/contact" size="lg">
            Teach With Us →
          </Button>
        </div>
      </section>
    </main>
  );
}
