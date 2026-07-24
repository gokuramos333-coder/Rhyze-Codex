import Link from 'next/link';

export default function AdminReviewsPage() {
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Reputation</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">REVIEWS</h1>
      <section className="mt-8 max-w-3xl border-t-4 border-rhyze-gold bg-white p-7">
        <h2 className="font-display text-4xl tracking-wider">REVIEW INBOX IS READY FOR CONNECTION</h2>
        <p className="mt-4 font-bold leading-relaxed text-rhyze-black/55">
          Somble did not include review records in the supplied exports. No reviews were invented. Connect a Google Business review source after launch, or use campaigns to ask verified attendees for feedback.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/admin/campaigns" className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase">Create Review Request</Link>
          <Link href="/contact" className="border border-black/20 px-5 py-3 text-xs font-black uppercase">View Public Contact</Link>
        </div>
      </section>
    </>
  );
}
