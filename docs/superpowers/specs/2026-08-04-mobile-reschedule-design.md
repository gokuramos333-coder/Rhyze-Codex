# Mobile Reschedule Design

## Problem

The member reschedule page uses a native select whose long option labels set an intrinsic width larger than a phone viewport. At 433px, the page expands to 762px and the portal is horizontally cropped.

## Design

Replace the select with full-width radio cards. Each destination is one bordered tap target showing the date/time, class name, instructor, and remaining availability. The selected card receives the Rhyze orange border and a light-orange background. The confirmation button remains below the list and fills the mobile width.

The page heading, notice, form padding, and text wrapping will scale down at phone widths without changing the desktop brand treatment. Empty destination results will show a clear message rather than an empty control.

## Scope

- Fix `/member/bookings/reschedule` without changing transfer eligibility or fee rules.
- Keep all destination values submitted as `destinationId` to the existing server action.
- Verify the complete member portal at phone width for horizontal overflow.
- Do not broadly redesign unaffected member pages.

## Verification

- Component regression test for accessible, required radio-card options.
- Existing reschedule surface tests.
- Typecheck, full unit suite, and production build.
- Browser checks at mobile width confirming page scroll width does not exceed viewport width.
