import React from 'react';

const newProgramSlugs = new Set([
  'work-tone-mswoy36a',
  'mommy-and-me-dennisse',
  'pound-mackenzie',
]);

export function isNewProgram(slug: string) {
  return newProgramSlugs.has(slug);
}

export function NewProgramBadge({ slug }: { slug: string }) {
  if (!isNewProgram(slug)) return null;
  return (
    <span className="inline-flex rounded-md border-2 border-rhyze-gold bg-rhyze-gold px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-rhyze-black shadow-glow">
      NEW!
    </span>
  );
}
