import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Sign In',
  robots: { index: false },
};

// TODO: Wire up real member portal when booking/account system is selected.
export default function SignInPlaceholder() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-8 inline-flex rounded-2xl border border-rhyze-gold/40 bg-rhyze-gold/10 p-4">
        <Lock className="h-8 w-8 text-rhyze-gold" aria-hidden />
      </div>
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-gold">
        Members Only — Coming Soon
      </p>
      <h1 className="font-display text-5xl tracking-wider md:text-7xl">
        MEMBER PORTAL <br />
        LAUNCHING WITH <br />
        THE STUDIO
      </h1>
      <p className="mt-6 max-w-lg text-rhyze-cream/70">
        Check back in with us when we unlock the doors. In the meantime, get
        on the list so you&apos;re first in line for opening week.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button href="/join" size="lg">
          Start $7 Trial →
        </Button>
        <Button href="/contact" size="lg" variant="outline">
          Get in touch
        </Button>
      </div>
    </main>
  );
}
