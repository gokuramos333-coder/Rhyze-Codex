import Link from 'next/link';
import { AuthField, AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { forgotPasswordAction } from '../actions';

export default async function ForgotPasswordPage(
  props: {
    searchParams: Promise<{ error?: string; sent?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <AuthFrame
      eyebrow="Account recovery"
      title="FIND YOUR WAY BACK"
      description="Enter the email connected to My Rhyze. Reset links expire after one hour and work once."
      footer={
        <Link href="/sign-in" className="font-black text-rhyze-coral">
          Return to sign in
        </Link>
      }
    >
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        My Rhyze
      </p>
      <h2 className="mt-3 font-display text-5xl tracking-wider">
        RESET PASSWORD
      </h2>
      {searchParams.sent ? (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold">
          If an active account matches that email, reset instructions will be
          sent. For security, this message is the same for every address.
        </p>
      ) : (
        <form action={forgotPasswordAction} className="mt-8 grid gap-5">
          <AuthField
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
          />
          {searchParams.error && (
            <p className="text-sm font-bold text-rhyze-coral">
              Enter a valid email address.
            </p>
          )}
          <button className="min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-[0.2em]">
            Request reset link
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
