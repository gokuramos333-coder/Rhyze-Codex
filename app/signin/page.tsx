import type { Metadata } from 'next';
import { Button } from '@/components/ui/Button';
import { sombleLoginUrl } from '@/lib/somble';

export const metadata: Metadata = {
  title: 'Sign In',
  robots: { index: false },
};

export default function SignInPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-16 md:py-20">
      <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-orange">
            Member Access
          </p>
          <h1 className="font-display text-5xl tracking-wider md:text-7xl">
            SIGN IN
          </h1>
          <p className="mt-4 max-w-2xl text-rhyze-cream/70">
            Log in through Somble to manage your Rhyze Fitness account, classes,
            and memberships.
          </p>
        </div>
        <Button href={sombleLoginUrl} target="_blank" rel="noreferrer" variant="outline">
          Open Somble Login
        </Button>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-rhyze-charcoal shadow-2xl shadow-black/40">
        <iframe
          src={sombleLoginUrl}
          title="Somble member login"
          className="h-[900px] w-full bg-white md:h-[980px]"
          loading="lazy"
        />
      </div>
    </main>
  );
}
