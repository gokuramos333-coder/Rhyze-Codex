import { Sparkles, UserPlus, Tag } from 'lucide-react';
import { memberPerks } from '@/lib/pricing';

const icons = [Sparkles, UserPlus, Tag];

export function MemberPerks() {
  return (
    <section className="mx-auto mt-24 max-w-7xl px-6">
      <div className="mb-10 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          All-Access Pass
        </p>
        <h2 className="font-display text-5xl tracking-wider md:text-7xl">
          MEMBER <span className="rhyze-gradient-text">PERKS</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-rhyze-cream/70">
          Every Rhyze membership gets you more than classes. Here&apos;s what
          else is waiting on the floor.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {memberPerks.map((p, i) => {
          const Icon = icons[i] ?? Sparkles;
          return (
            <div
              key={p.title}
              className="group rounded-3xl border border-white/10 bg-rhyze-charcoal p-8 transition hover:-translate-y-1 hover:border-rhyze-coral/40"
            >
              <div className="mb-6 inline-flex rounded-2xl border border-white/10 bg-rhyze-black/50 p-3 text-rhyze-coral">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mb-3 font-display text-2xl tracking-wider">
                {p.title}
              </h3>
              <p className="text-sm text-rhyze-cream/70">{p.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
