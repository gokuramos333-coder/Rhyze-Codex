# Admin Classes Calendar and Gallery Design

## Goal

Make the Admin Classes page show meaningfully different daily, weekly, and monthly schedules from the same class-occurrence records used by the public schedule, while reducing the slideshow manager's default height.

## Scope

This change is limited to `/admin/classes`, its schedule-range logic, its class calendar presentation, and the existing class gallery manager. Revenue analytics and public schedule behavior remain unchanged.

## Schedule architecture

The class calendar will use schedule-specific query parameters instead of sharing the revenue analytics `range` parameter:

- `view=day|week|month` selects the calendar mode.
- `date=YYYY-MM-DD` anchors the selected period.
- Daily covers the complete selected local day.
- Weekly covers Monday through Sunday containing the selected date.
- Monthly covers the complete calendar month containing the selected date.

The page will query scheduled, non-event class occurrences from PostgreSQL for the complete selected period. These are the same `ClassOccurrence` records that feed the public schedule, so changes to class dates, instructors, capacities, and bookings stay synchronized automatically.

Revenue analytics will continue using its existing `range`, `from`, and `to` parameters. Calendar controls must preserve those parameters when navigating so reviewing the schedule does not unexpectedly change the revenue charts.

## Calendar interface

The Scheduled Classes section will include:

- Daily, Weekly, and Monthly mode controls with a visible active state.
- Previous and next period controls.
- A clear selected-period label.
- Chronological class cards showing date/time, category, class name, instructor, confirmed signup count, capacity, and an Attendees destination.
- An honest empty state when the selected period has no scheduled classes.

The controls will remain server-rendered links so they work without client-side state and support direct URLs, refreshes, and browser history.

## Gallery interface

The gallery manager will start collapsed:

- One horizontal row of compact thumbnails is visible.
- An `Enlarge` button reveals the full editable gallery.
- Expanded mode shows every photo plus drag-to-reorder, remove, save-order, and upload controls.
- The control changes to `Collapse` when expanded.
- Collapsing does not modify gallery data.

This keeps the visual reference available without pushing the schedule far down the Admin Classes page.

## Error handling

Invalid or missing `view` values fall back to Weekly. Invalid or missing dates fall back to the current Rhyze studio date. Database errors continue through the existing Next.js error boundary behavior; empty periods render the local empty state rather than appearing broken.

## Testing

Automated tests will cover:

- Complete day, week, and month date boundaries.
- Weekly Monday-to-Sunday behavior.
- Calendar query parameters remaining independent from analytics parameters.
- Daily, Weekly, Monthly, previous, and next destinations.
- The gallery defaulting to one-row collapsed mode.
- Enlarge and Collapse revealing and hiding all editing controls.

Verification will run the focused tests first, followed by typecheck, the full test suite, and production build.

## Out of scope

- Changing public schedule styling or behavior.
- Changing event scheduling.
- Changing revenue calculations.
- Refactoring unrelated Admin pages.
