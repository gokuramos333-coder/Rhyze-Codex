import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminMembershipStartForm } from '../../components/admin/AdminMembershipStartForm';
const products = [
 {id:'synthetic-long',name:'Synthetic unlimited membership with an exceptionally long descriptive plan name for wrapping verification',priceCents:19900,stripePriceId:'synthetic-price'},
 {id:'synthetic-assignment',name:'Synthetic assignment-only extended membership with a long descriptive name',priceCents:9200,stripePriceId:null},
];
// Deliberately no server actions, credentials, persistence or application runtime.
const noAction = () => {};
createRoot(document.getElementById('root')!).render(
 <main className="admin-shell min-h-screen bg-[#eee9dd] text-rhyze-black">
 <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
 <aside className="bg-rhyze-black p-5 text-rhyze-cream"><h1 className="font-display text-3xl">ADMIN · SYNTHETIC</h1><p>No client data</p></aside>
 <section className="min-w-0 px-5 py-8 md:px-8 lg:px-10">
  <p style={{padding:16,fontWeight:800}}>SYNTHETIC LAYOUT PREVIEW — NOT LIVE. No payments or assignments can be submitted.</p>
  <section id="memberships" className="scroll-mt-24 border-t-4 border-rhyze-gold bg-white p-5">
   <h2 className="font-display text-4xl tracking-wider">MEMBERSHIPS</h2>
   <div className="mt-3"><AdminMembershipStartForm userId="synthetic-preview-only" products={products} checkoutAction={noAction} assignmentAction={noAction} minimumEndDate="2026-11-08" /></div>
  </section>
 </section>
 </div>
 </main>
);
document.addEventListener('submit',event=>event.preventDefault(),true);
