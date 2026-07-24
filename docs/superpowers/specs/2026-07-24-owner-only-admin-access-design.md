# Owner-only Admin Access

## Goal

Rename the current “Studio OS” experience to “ADMIN” and make it accessible only to the two Rhyze Fitness owners:

- `vanessa@rhyzefit.com`
- `melissa@rhyzefit.com`

The restriction must be enforced by the server. Hiding navigation alone is not sufficient.

## Access policy

An account may access `/admin` and `/dashboard` only when all of the following are true:

1. The user is authenticated.
2. The database user is active.
3. The normalized account email is one of the two approved owner emails.
4. The account role is `OWNER`.

Unauthenticated visitors are redirected to sign-in with a callback to the requested owner page. Authenticated users who are not approved owners are redirected to the dashboard appropriate for their role.

## Navigation

“Studio OS” is renamed to “ADMIN” everywhere it describes the owner workspace.

The ADMIN link is removed from static public navigation and the public sitemap. A signed-in approved owner sees an ADMIN link in desktop and mobile navigation. Other visitors see no ADMIN link.

Because the site header is currently client-only, the root layout will resolve the authenticated user on the server and pass a boolean owner-access flag through the site chrome to desktop and mobile navigation. The client receives only the boolean, not an email allowlist.

## Server enforcement

A focused authorization helper will normalize email addresses and decide whether a user is an approved owner. Both the `/admin` layout and `/dashboard` page call the same server-side owner requirement. This prevents direct URL access, stale navigation, or client-side manipulation from bypassing authorization.

The existing member and instructor experiences remain unchanged.

## Tests

Tests will prove:

- Vanessa and Melissa are recognized as approved owner accounts.
- Matching is case-insensitive.
- Other owners, admins, managers, instructors, and members are rejected.
- Public navigation data and the sitemap no longer expose `/dashboard`.
- Existing route-link audits continue to pass.

## Scope

This change does not alter account creation, promote users to `OWNER`, or create new owner accounts. Vanessa and Melissa must already have active accounts with the `OWNER` role in the database.
