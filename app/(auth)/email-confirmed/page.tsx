import Link from 'next/link';
import { AuthFrame } from '@/components/domain/accounts/AuthFrame';

export default function EmailConfirmedPage() {
  return (
    <AuthFrame
      eyebrow="Account security"
      title="EMAIL CONFIRMED"
      description="Your account email has been changed. Your existing account and history are preserved."
      footer={<Link href="/sign-in">Sign in with your new email</Link>}
    >
      <p className="text-sm">
        Use your new email and existing password to sign in. Existing sessions
        have been signed out. If your account has not been activated yet, use
        Forgot password with the new email to request a fresh activation link.
      </p>
      <Link
        href="/sign-in"
        className="mt-6 inline-flex min-h-14 items-center bg-rhyze-gradient px-6 text-sm font-black uppercase"
      >
        Sign in
      </Link>
    </AuthFrame>
  );
}
