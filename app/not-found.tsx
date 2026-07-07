import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <p className="mb-3 font-display text-9xl leading-none tracking-wider md:text-[12rem]">
        4<span className="rhyze-gradient-text">0</span>4
      </p>
      <p className="mb-2 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
        Off the Beat
      </p>
      <h1 className="mb-4 font-display text-4xl tracking-wider md:text-6xl">
        THIS PAGE IS RESTING
      </h1>
      <p className="mb-10 text-rhyze-cream/70">
        The page you’re looking for doesn’t exist, but the floor’s still open.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button href="/" size="lg">
          Back to Home →
        </Button>
        <Button href="/classes" size="lg" variant="outline">
          See the Schedule
        </Button>
      </div>
    </main>
  );
}
