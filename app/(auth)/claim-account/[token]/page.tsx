import Link from 'next/link';
import { AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { ClaimAccountForm } from '@/components/domain/accounts/ClaimAccountForm';
import { claimAccountAction } from '../actions';

export default async function ClaimAccountPage(
  props: {
    params: Promise<{ token: string }>;
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  return (
    <AuthFrame
      eyebrow="Your new My Rhyze"
      title="ACTIVATE YOUR ACCOUNT"
      description="Your Rhyze profile is ready. Choose a secure password to activate your account."
      footer={
        <Link href="/sign-in" className="font-black text-rhyze-coral">
          Return to sign in
        </Link>
      }
    >
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        One secure step
      </p>
      <h2 className="mt-3 font-display text-5xl tracking-wider">
        SET YOUR PASSWORD
      </h2>
      {searchParams.error && (
        <div className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
          {searchParams.error === 'token' ? (
            <>
              This activation link is invalid or expired.{' '}
              <Link href="/forgot-password" className="underline">
                Request account help
              </Link>
              .
            </>
          ) : searchParams.error === 'agreement' ? (
            'Accept the current studio policies and waiver to activate your account.'
          ) : (
            'Use at least 9 characters with an uppercase letter, number, and symbol, and make sure both entries match.'
          )}
        </div>
      )}
      <ClaimAccountForm token={params.token} action={claimAccountAction} />
    </AuthFrame>
  );
}
