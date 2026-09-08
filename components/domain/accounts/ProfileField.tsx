export function ProfileField({
  label,
  name,
  defaultValue,
  autoComplete,
  type = 'text',
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  autoComplete?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-rhyze-black/55">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue || ''}
        autoComplete={autoComplete}
        className="focus-ring min-h-12 border border-rhyze-black/15 bg-white px-4 outline-none focus:border-rhyze-coral"
      />
    </label>
  );
}
