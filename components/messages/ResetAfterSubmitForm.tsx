'use client';

import { useRef, type ReactNode } from 'react';

export function ResetAfterSubmitForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={action}
      className={className}
      onSubmit={() => window.setTimeout(() => formRef.current?.reset(), 0)}
    >
      {children}
    </form>
  );
}
