import { redirect } from 'next/navigation';

export default function AdminOfferingsRedirect() {
  redirect('/admin/products');
}
