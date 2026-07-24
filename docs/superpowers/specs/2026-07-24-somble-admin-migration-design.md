# Somble Data Migration and ADMIN Dashboard

## Goal

Replace the current prototype dashboard with an owner-only, branded Rhyze ADMIN workspace that uses the supplied Somble client and transaction exports as historical source data.

## Source-data interpretation

- The client export contains 23 unique clients.
- The transaction export contains 22 unique transfers totaling $935.
- Amounts are labeled **Somble transferred revenue**, not gross sales, because the export contains transfer amounts that may be net of platform or payment fees.
- Original Somble transfer and payment IDs are retained for reconciliation and idempotency.
- Imported clients are created as `INVITED` member accounts without passwords. Existing accounts are matched by normalized email and are not overwritten.
- Somble-specific status, login, workout, app-download, birthday, and join-date values are retained in a dedicated import profile.
- Historical transfers are stored separately from native Stripe purchases. They remain reportable but cannot be refunded through the new Stripe account.

## ADMIN experience

The existing `/admin` workspace becomes the canonical owner dashboard. `/dashboard` redirects approved owners to `/admin`.

The branded dark/coral/gold navigation provides:

- Overview
- Clients
- Offerings
- Schedule
- Sales
- Engagement
- Messages
- Promotions
- Integrations
- Reviews
- Settings

Overview combines real database metrics, imported Somble activity, upcoming Rhyze classes, client summaries, offering performance, and transferred-revenue totals. Existing management pages remain available for detailed class, schedule, product, payment, campaign, report, waiver, and instructor work.

Every visible control links to an existing management page, changes a visible filter/tab, downloads a CSV, or is explicitly marked unavailable.

## Security

Only active `OWNER` accounts whose normalized email is `vanessa@rhyzefit.com` or `melissa@rhyzefit.com` may access `/admin` or `/dashboard`. Public navigation and sitemap data do not expose ADMIN. Approved owners receive the ADMIN navigation link after authentication.

## Migration safety

The importer is an explicit script with `--dry-run` and `--apply` modes. It validates required columns, normalizes names and emails, rejects duplicate external IDs, reports reconciliation totals, and uses upserts so repeated execution does not duplicate customers or transfers.

## Verification

Automated tests cover owner authorization, CSV validation and normalization, import totals, idempotent identifiers, navigation visibility, and dashboard calculations. Final verification includes type checking, all tests, production build, database reconciliation, and browser checks of the ADMIN routes.
