import { Camera } from 'lucide-react';

const tiles = [
  { label: 'The floor', aspect: 'aspect-[4/5]' },
  { label: 'Dance class', aspect: 'aspect-square' },
  { label: 'Community', aspect: 'aspect-[4/5]' },
  { label: 'Strength', aspect: 'aspect-square' },
  { label: 'Yoga', aspect: 'aspect-[4/5]' },
  { label: 'Latin nights', aspect: 'aspect-square' },
  { label: 'Pop-up events', aspect: 'aspect-[4/5]' },
  { label: 'Post-class', aspect: 'aspect-square' },
];

// TODO: Replace with real photos once studio photography is in.
export function GalleryGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t, i) => (
        <div
          key={`${t.label}-${i}`}
          className={`relative ${t.aspect} overflow-hidden rounded-2xl border border-white/10 bg-rhyze-charcoal`}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-rhyze-coral/10 via-rhyze-orange/5 to-transparent"
          />
          <div className="relative flex h-full flex-col items-center justify-center text-center">
            <div className="inline-flex rounded-xl border border-white/10 bg-rhyze-black/60 p-2.5">
              <Camera className="h-5 w-5 text-rhyze-coral" aria-hidden />
            </div>
            <p className="mt-4 text-xs uppercase tracking-widest text-rhyze-cream/50">
              Photo coming soon
            </p>
            <p className="mt-1 font-display text-lg tracking-wider text-rhyze-cream/70">
              {t.label.toUpperCase()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
