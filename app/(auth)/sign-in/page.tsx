import Link from 'next/link';
import { AuthField, AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { signInAction } from '../actions';

const errorMessages: Record<string, string> = {
  invalid: 'Enter a valid email address and password.',
  credentials: 'The email or password did not match an active account.',
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string; reset?: string; callbackUrl?: string; plan?: string };
}) {
  const error = searchParams.error
    ? errorMessages[searchParams.error]
    : undefined;
  const requestedCallback = searchParams.callbackUrl ?? '';
  const callbackUrl =
    requestedCallback.startsWith('/') && !requestedCallback.startsWith('//')
      ? requestedCallback
      : searchParams.plan
        ? `/member/membership?plan=${encodeURIComponent(searchParams.plan)}#available-plans`
        : '';
  const signUpHref = callbackUrl
    ? `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/sign-up';

  return (
    <AuthFrame
      eyebrow="Welcome back"
      title="STEP BACK ON THE FLOOR"
      description="Your classes, credits, waiver, receipts, and membership live together in My Rhyze."
      footer={
        <p>
          New to Rhyze?{' '}
          <Link href={signUpHref} className="font-black text-rhyze-coral">
            Create your account
          </Link>
        </p>
      }
    >
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        My Rhyze
      </p>
      <h2 className="mt-3 font-display text-5xl tracking-wider">SIGN IN</h2>
      {error && (
        <p className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
          {error}
        </p>
      )}
      {searchParams.reset && (
        <p className="mt-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold">
          Password updated. Sign in with your new password.
        </p>
      )}
      <form action={signInAction} className="mt-8 grid gap-5">
        {callbackUrl && (
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
        )}
        <AuthField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-bold text-rhyze-black/60 hover:text-rhyze-coral"
          >
            Forgot password?
          </Link>
        </div>
        <button className="min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-[0.2em] text-rhyze-black">
          Enter My Rhyze
        </button>
      </form>
    </AuthFrame>
  );
}
