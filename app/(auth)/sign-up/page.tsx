import Link from 'next/link';
import { AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { SignUpForm } from '@/components/domain/accounts/SignUpForm';

const errorMessages: Record<string, string> = {
  invalid: 'Check each field and make sure the passwords match.',
  exists: 'An account already exists for this email. Sign in instead.',
  password:
    'Use 9 or more characters with an uppercase letter, number, and symbol.',
  instructor: 'That instructor access code is not valid.',
};

export default function SignUpPage({
  searchParams,
}: {
  searchParams: {
    error?: string;
    ref?: string;
    callbackUrl?: string;
    plan?: string;
  };
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
  const signInHref = callbackUrl
    ? `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/sign-in';

  return (
    <AuthFrame
      eyebrow="Your first step"
      title="CLAIM YOUR PLACE"
      description="Create one account for booking, waivers, memberships, attendance, and studio updates."
      footer={
        <p>
          Already have an account?{' '}
          <Link href={signInHref} className="font-black text-rhyze-coral">
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
      <SignUpForm
        defaultReferral={searchParams.ref || ''}
        callbackUrl={callbackUrl}
      />
    </AuthFrame>
  );
}
