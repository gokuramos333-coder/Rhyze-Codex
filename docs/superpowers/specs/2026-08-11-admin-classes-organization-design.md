# Admin Classes Organization Design

## Goal

Make the Admin Classes page easier to scan and navigate while keeping class history safe and preserving the existing visual system and business rules.

## Page Structure

Keep `/admin/classes` as one page and divide it into four clearly titled sections with stable fragment identifiers:

1. `#slideshow-photos` — **SLIDESHOW PHOTOS**
2. `#scheduled-classes` — **SCHEDULED CLASSES**
3. `#create-a-class` — **CREATE A CLASS**
4. `#edit-a-class` — **EDIT A CLASS**

The existing analytics header remains above these operational sections. Each section keeps the current white card, border, typography, and spacing conventions.

## Admin Navigation

The Classes item in the admin sidebar becomes an expandable parent item with four child links. Each child link targets the corresponding fragment on `/admin/classes`. The submenu is expanded while the user is on the Classes route and remains usable on desktop and responsive navigation layouts.

Navigation item types will support optional child links without changing existing flat navigation items or badges.

## Scheduled Classes Default

Opening `/admin/classes` without a `range` query parameter shows the Daily range. Explicit `range=week` and `range=month` selections continue to show Weekly and Monthly data. The Events page keeps its existing default unless separately changed.

## Create and Edit Labels

Add a **CREATE A CLASS** heading immediately above the creation form and an **EDIT A CLASS** heading immediately above the class-template cards. Existing template names, edit links, archive controls, and class details remain unchanged.

## Delete and Archive Rules

Archive remains a distinct non-destructive action that sets the template inactive and records `archivedAt`.

Delete permanently removes a template only when its occurrences have no protected history or dependent business records. Protected history includes bookings, waitlist entries, attendance records, class messages, and commerce orders. Future or otherwise empty occurrences and their series may be deleted with the template.

If protected history exists, Delete performs no mutation and redirects back with this explanation:

> This class has history and cannot be deleted. Archive it instead.

Delete must never silently archive a class.

## Error Handling

- A missing template remains a no-op.
- A protected template remains unchanged when Delete is requested.
- Successful deletion keeps the existing audit log and route revalidation behavior.
- Archive continues to use its existing audit log and route revalidation behavior.

## Testing

Add regression coverage for:

- All four section headings and fragment identifiers.
- The Classes sidebar submenu and its four destinations.
- Daily as the Classes page default without changing the Events page default.
- Delete refusing protected historical templates without archiving them.
- Delete removing empty occurrences, series, and the template.
- Archive remaining a separate non-destructive action.

Run the focused tests first, then the full test suite, typecheck, and production build. Do not deploy.
