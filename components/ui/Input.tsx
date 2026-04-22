import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-xl border border-white/10 bg-rhyze-black/40 px-4 py-3 text-sm placeholder:text-rhyze-cream/40 focus-ring';

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }
>(function Input({ className, error, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(base, error && 'border-rhyze-coral/70', className)}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(function Textarea({ className, error, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(base, 'min-h-[120px]', error && 'border-rhyze-coral/70', className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(function Select({ className, error, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(base, 'appearance-none pr-10', error && 'border-rhyze-coral/70', className)}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Label({
  children,
  htmlFor,
  required,
}: {
  children: React.ReactNode;
  htmlFor: string;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs uppercase tracking-widest text-rhyze-cream/70"
    >
      {children}
      {required && <span className="ml-1 text-rhyze-coral">*</span>}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-rhyze-coral">{message}</p>;
}
