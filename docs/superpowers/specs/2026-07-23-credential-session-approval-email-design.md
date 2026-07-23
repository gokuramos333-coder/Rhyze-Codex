# Credential, Session, and Instructor Approval Email Design

## Scope

This change improves instructor credential uploads, keeps authenticated users signed in for a practical long-lived period, and alerts both studio owners when a new instructor application needs approval.

## Instructor credentials

- Insurance and CPR documents remain required for approved instructors.
- The expiration date is optional at upload time.
- `InstructorCredential.expiresAt` becomes nullable.
- A credential with no expiration date can still be reviewed and approved.
- Expiration reminder jobs ignore credentials without an expiration date.
- Existing credentials and their dates remain unchanged.
- The upload cards and date controls use a light orange background with black text.
- The page shows `No expiration date provided` when the latest credential has no date.
- File type and file presence validation remain mandatory.

## Persistent login

- Auth.js JWT sessions use a one-year maximum age.
- The session cookie persists across browser restarts.
- Explicit sign-out invalidates the current login cookie.
- Existing role-based authorization remains unchanged.
- Users may need to sign in once after this release before receiving the longer-lived cookie.

## Instructor approval notifications

- When signup includes the valid instructor invitation code and creates a pending application, queue one approval email to each of:
  - `vanessa@rhyzefit.com`
  - `melissa@rhyzefit.com`
- Each email identifies the applicant by name and email and links to `/admin/instructors`.
- Emails are background-queued; signup does not wait for delivery.
- The applicant remains a Member until an admin approves the application.
- Approval requires one action only: either Vanessa or Melissa can approve the application.
- The first approval changes the application from `PENDING` to `APPROVED`; any later approval attempt is a safe no-op.
- No second approval or consensus step is required.
- A deterministic deduplication key prevents duplicate approval emails for the same application and recipient.
- Normal member signups do not generate approval emails.

## Testing

- Validation test: a missing expiration date is accepted; an invalid supplied date is rejected.
- Reminder test: undated credentials are excluded from expiration reminders.
- Signup service/action test: pending instructor signup queues both owner notifications, while member signup does not.
- Authentication configuration test: JWT session maximum age is one year.
- Run unit tests, type checking, linting, database migration validation, and production build.

## Risks and safeguards

- A one-year session increases risk on a shared device; visible sign-out remains the mitigation.
- Nullable expiration dates mean admins must manually monitor documents that do not state an expiration.
- Owner email delivery requires the configured email worker and provider.
