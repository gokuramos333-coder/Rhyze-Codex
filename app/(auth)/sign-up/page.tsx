import Link from 'next/link';
import { AuthField, AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { signUpAction } from '../actions';

const errorMessages: Record<string, string> = {
  invalid: 'Check each field and make sure the passwords match.',
  exists: 'An account already exists for this email. Sign in instead.',
  password:
    'Use 12 or more characters with an uppercase letter, number, and symbol.',
};

export default function SignUpPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error
    ? errorMessages[searchParams.error]
    : undefined;

  return (
    <AuthFrame
      eyebrow="Your first step"
      title="CLAIM YOUR PLACE"
      description="Create one account for booking, waivers, memberships, attendance, and studio updates."
      footer={
        <p>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-black text-rhyze-coral">
            Sign in
          </Link>
        </p>
      }
    >
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        My Rhyze
      </p>
      <h2 className="mt-3 font-display text-5xl tracking-wider">
        CREATE ACCOUNT
      </h2>
      {error && (
        <p className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
          {error}
        </p>
      )}
      <form action={signUpAction} className="mt-8 grid gap-5">
        <AuthField
          label="Full name"
          name="name"
          autoComplete="name"
        />
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
          autoComplete="new-password"
        />
        <AuthField
          label="Confirm password"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
        />
        <p className="-mt-1 text-xs leading-5 text-rhyze-black/50">
          Use at least 12 characters with an uppercase letter, number, and
          symbol.
        </p>
        <button className="min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-[0.2em] text-rhyze-black">
          Create My Rhyze
        </button>
      </form>
    </AuthFrame>
  );
}
