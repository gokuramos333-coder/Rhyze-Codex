import { cn } from '@/lib/cn';

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function Badge({ children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
        className,
      )}
    >
      {children}
    </span>
  );
}
