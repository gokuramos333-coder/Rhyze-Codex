# Somble Schedule Connect Design

## Goal

Make Somble the live source of truth for Rhyze Fitness schedules and booking from the website.

## Approved source

- Public Somble profile: `https://www.somble.com/vanessaramos`
- Public Somble schedule: `https://www.somble.com/vanessaramos/classes`

## Design

Replace the hard-coded weekly schedule display in the Classes page with a branded Rhyze section that embeds the live Somble schedule page and includes a direct fallback button to open Somble in a new tab.

To avoid fake or stale schedule information, remove hard-coded schedule previews from the homepage and class detail pages. Those areas should point visitors to the Somble-powered schedule instead of showing static class times.

## Components and data flow

- Add `lib/somble.ts` for the canonical Somble URLs.
- Update `components/sections/ScheduleFull.tsx` to render the Somble iframe and direct booking link.
- Update `components/sections/SchedulePreview.tsx` to promote the live Somble schedule without hard-coded slots.
- Update `components/sections/ClassList.tsx` so class-card “Book” buttons open Somble.
- Update `app/classes/[slug]/page.tsx` so class detail booking buttons go directly to Somble.

## Error handling

The iframe includes a direct “Open Somble Schedule” link so visitors can still book if a browser blocks iframe content.

## Testing

Add a Node test that verifies the Somble schedule URL is centralized and that the schedule UI references Somble rather than the local hard-coded schedule source.
