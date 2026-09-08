import Link from 'next/link';
import { AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { ResetPasswordForm } from '@/components/domain/accounts/ResetPasswordForm';
import { resetPasswordAction } from '../../actions';

export default async function ResetPasswordPage(
  props: {
    params: Promise<{ token: string }>;
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
            : 'Use at least 9 characters with an uppercase letter, number, and symbol, and make sure both entries match.'}
        </p>
      )}
      <ResetPasswordForm token={params.token} action={resetPasswordAction} />
    </AuthFrame>
  );
}
