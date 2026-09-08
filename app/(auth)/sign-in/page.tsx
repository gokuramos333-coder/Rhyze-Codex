import Link from 'next/link';
import { AuthField, AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { PasswordField } from '@/components/domain/accounts/PasswordField';
import { AccountAccessNotice } from '@/components/domain/accounts/AccountAccessNotice';
import { signInAction } from '../actions';

const errorMessages: Record<string, string> = {
  invalid: 'Enter a valid email address and password.',
  credentials: 'The email or password did not match an active account.',
};

export default async function SignInPage(
  props: {
    searchParams: Promise<{ error?: string; reset?: string; claimed?: string; callbackUrl?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const error = searchParams.error
    ? errorMessages[searchParams.error]
    : undefined;
  const callbackUrl =
    searchParams.callbackUrl?.startsWith('/') &&
    !searchParams.callbackUrl.startsWith('//')
      ? searchParams.callbackUrl
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
      <AccountAccessNotice
        claimed={Boolean(searchParams.claimed)}
        reset={Boolean(searchParams.reset)}
      />
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
        <PasswordField
          label="Password"
          name="password"
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
