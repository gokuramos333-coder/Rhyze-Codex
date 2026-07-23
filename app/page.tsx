import { Hero } from '@/components/sections/Hero';
import { WelcomeCopy } from '@/components/sections/WelcomeCopy';
import { ThreePillars } from '@/components/sections/ThreePillars';
import { SchedulePreview } from '@/components/sections/SchedulePreview';
import { EventsPreview } from '@/components/sections/EventsPreview';
import { PricingTeaser } from '@/components/sections/PricingTeaser';
import { FoundersStrip } from '@/components/sections/FoundersStrip';
import { LocationBlock } from '@/components/sections/LocationBlock';
import { FinalCTA } from '@/components/sections/FinalCTA';

// The pt-44 spacer in layout.tsx makes room for the fixed header. We negate
// it here so the hero truly fills the viewport on the home page.
export default function HomePage() {
  return (
    <main className="-mt-44">
      <Hero />
      <WelcomeCopy />
      <ThreePillars />
      <SchedulePreview />
      <EventsPreview />
      <PricingTeaser />
      <FoundersStrip />
      <LocationBlock />
      <FinalCTA />
    </main>
  );
}
