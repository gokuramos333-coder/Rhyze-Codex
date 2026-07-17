import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Pricing & Memberships',
  description:
    'Start with a $7 seven-day trial, then pick your rhythm, weekly, twice-a-week, or unlimited memberships at Rhyze Fitness.',
};

export default function PricingPage() {
  redirect('/join');
}
