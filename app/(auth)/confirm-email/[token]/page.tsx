import Link from 'next/link';
import { AuthFrame } from '@/components/domain/accounts/AuthFrame';
import { identityErrorMessage } from '@/lib/domain/accounts/account-identity-service';
import { confirmAccountEmailAction } from './actions';

export const metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};

export default async function ConfirmAccountEmailPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await props.params;
  const { error } = await props.searchParams;
  return (
    <AuthFrame
      eyebrow="Account security"
      title="CONFIRM YOUR EMAIL"
      description="Confirm this address only if you requested the change or asked management to make it."
      footer={<Link href="/sign-in">Return to sign in</Link>}
    >
      {error && (
        <p role="alert" className="mb-5 bg-orange-50 p-4 text-sm font-bold">
          {identityErrorMessage(error)}
        </p>
      )}
      <p className="text-sm">
        Your memberships, bookings, and payment history will stay with the same
        account. After confirmation, sign in with your new email and existing
        password. Invited members can use Forgot password to request a new
        activation link.
      </p>
      <form action={confirmAccountEmailAction.bind(null, token)}>
        <button className="mt-6 min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-widest">
          Confirm new email
        </button>
      </form>
    </AuthFrame>
  );
}
