import { Button } from '@/components/ui/Button';

export function FinalCTA() {
  return (
    <section className="px-6 py-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-rhyze-gradient p-12 text-center md:p-20">
        <div
          aria-hidden
          className="grain absolute inset-0 opacity-30 mix-blend-overlay"
        />
        <div className="relative">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-rhyze-black/70">
            Ready when you are
          </p>
          <h2 className="mb-6 font-display text-6xl leading-none tracking-wider text-rhyze-black md:text-8xl">
            READY TO RHYZE?
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-rhyze-black/80 md:text-xl">
            Seven days. Unlimited classes. Seven dollars. No catch, just the
            floor. Starts August 3, 2026.
          </p>
          <Button
            href="/join"
            size="lg"
            className="bg-rhyze-black text-rhyze-cream hover:bg-rhyze-charcoal hover:shadow-[0_0_40px_rgba(0,0,0,0.35)]"
          >
            Start Your $7 Trial →
          </Button>
        </div>
      </div>
    </section>
  );
}
