import Link from 'next/link';
import { AuthField, AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { resetPasswordAction } from '../../actions';

export default function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  return (
    <AuthFrame
      eyebrow="One final step"
      title="SET A NEW KEY"
      description="Choose a strong password that you do not use anywhere else."
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
        NEW PASSWORD
      </h2>
      {searchParams.error && (
        <p className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
          {searchParams.error === 'token'
            ? 'This reset link is invalid or expired. Request a new one.'
            : 'Use 12 or more characters with an uppercase letter, number, and symbol.'}
        </p>
      )}
      <form action={resetPasswordAction} className="mt-8 grid gap-5">
        <input type="hidden" name="token" value={params.token} />
        <AuthField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
        />
        <AuthField
          label="Confirm new password"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
        />
        <button className="min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-[0.2em]">
          Save new password
        </button>
      </form>
    </AuthFrame>
  );
}
