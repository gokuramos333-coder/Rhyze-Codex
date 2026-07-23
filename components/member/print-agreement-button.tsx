'use client';

export function PrintAgreementButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="ml-3 min-h-12 border border-rhyze-black px-5 text-xs font-black uppercase tracking-[0.2em]"
    >
      Print or save
    </button>
  );
}
