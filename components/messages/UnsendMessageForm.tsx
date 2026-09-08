'use client';

type UnsendMessageFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
};

export function UnsendMessageForm({ action, fields }: UnsendMessageFormProps) {
  return (
    <form
      action={action}
      className="mt-3 text-right"
      onSubmit={(event) => {
        if (!window.confirm('Unsend this message? Its content will be removed for everyone in this conversation.')) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className="text-xs font-black uppercase tracking-widest text-rhyze-coral underline underline-offset-4">
        Unsend
      </button>
    </form>
  );
}
