# Admin Client Membership and Upcoming Events Design

## Objective

Show only bookable future events on the public site, replace the misleading
historical-subscription dashboard metric with a consistent active-membership
metric, make the overview revenue and refund cards report the current calendar
month with range-aware drill-down charts, and let Rhyze management create
client accounts and either start a secure Stripe membership purchase or grant
a time-bounded membership without a charge.

The feature must preserve all existing users, bookings, purchases,
memberships, Stripe identifiers, email history, waivers, credits, and audit
records. It must not deploy until the user explicitly requests deployment.

## Current State

- The shared `EventsPreview` query uses a fixed August-through-September 2026
  display window. Because it does not compare occurrences with the current
  time, the home page shows three past August events before four upcoming
  September events.
- The admin overview labels one card `Historical subscriptions`, displays the
  number of imported Somble subscription transactions, and mixes that number
  with the count of every current native membership record.
- The production database currently has 24 current membership records. Sixteen
  are $7 intro trials. Eight distinct clients have a current recurring
  membership after excluding intro trials, single classes, events, and credit
  packs.
- The Clients page already filters by individual membership product, but there
  is no single filter for all qualifying active memberships.
- A public signup creates the account and requires the member to choose a
  password and sign the waiver. Admin has no create-client screen.
- A client profile can pause or resume an existing membership, but cannot start
  a membership for a client who has none.
- The overview `Total revenue` and `Refunds issued` cards currently display
  lifetime amounts. The existing earnings controls can select day, week,
  month, year, or custom dates, but refunds are not represented as a dated
  analytics series.
- Purchase refunds have dedicated rows with timestamps. Event and merchandise
  refunds only update cumulative amounts on their commerce orders, so the
  system cannot reliably place those refunds into historical accounting ranges.

## Membership Definition

One shared predicate will define an active membership everywhere in this
feature.

A qualifying membership must:

- have status `ACTIVE` or `TRIALING`;
- belong to a product whose kind is `MONTHLY_UNLIMITED`,
  `LIMITED_MEMBERSHIP`, or `VIP`; and
- belong to a real, non-local user account.

The count is the number of distinct users, not the number of membership rows.
It includes public and private recurring memberships, including a deliberately
assigned complimentary recurring membership. It excludes `INTRO_TRIAL`,
`CLASS_PACK`, `DROP_IN`, event commerce orders, cancelled memberships, expired
memberships, paused memberships, and past-due memberships.

The predicate will live in a focused domain/admin helper and will supply both
the Prisma filter used by the dashboard and the filter used by the client
directory. This prevents the card and directory from drifting apart.

## Public Upcoming Events

The public query will return only occurrences that meet all of these rules:

- the template is an active, non-archived event;
- the occurrence is `SCHEDULED`; and
- `startAt` is greater than or equal to the current time.

The fixed August/September display window will be removed. Results will remain
ordered by occurrence start time. Past occurrence records remain in the
database and remain available to authenticated admin reporting; only the
public upcoming-event presentation changes.

The home page will render an interactive carousel with:

- three cards visible at a time on desktop;
- one card visible at a time on small screens;
- left and right buttons that move one visible group at a time;
- hidden or disabled controls when movement in that direction is unavailable;
- no carousel controls when all available cards already fit;
- keyboard-operable buttons, useful accessible labels, and reduced-motion
  behavior; and
- the existing Rhyze black, charcoal, gold, orange, and coral visual language.

The separate Events page will continue to show all upcoming events rather than
being limited to the first three. Both surfaces will use the same future-only
query result.

If there are no upcoming events, the section will show a short empty-state
message directing visitors to check back rather than rendering an empty strip.

## Admin Overview and Client Directory

The overview card will be renamed `Active memberships`. Its value will be the
distinct qualifying-member count from the shared definition. Its detail line
will identify that trials and one-time purchases are excluded.

The card will link to:

`/admin/members?membership=active`

The Clients page will recognize this filter and apply the same qualifying
membership predicate. The page will visibly state that only active membership
clients are shown. The existing Current plan column will continue to display
the plan name and will therefore show management exactly which membership each
listed client has. Existing search, source, account-status, plan, and sort
controls will remain available and composable with the active-membership
filter.

## Monthly Financial Cards and Drill-Down

The two overview cards will be renamed `Revenue this month` and `Refunds this
month`. Their values will reset at midnight on the first day of every calendar
month in `America/New_York`; no historical rows will be reset, deleted, or
modified. A reset means only that the card query changes to the new month's
date range.

Financial analytics will distinguish three values:

- gross revenue recorded during the selected range;
- refunds issued during the selected range, dated by the actual refund time;
  and
- net revenue for the selected range, calculated as gross revenue minus those
  dated refunds.

Somble transferred revenue will remain assigned to its transferred timestamp.
Native purchases and unlinked Stripe payment records will remain assigned to
their paid/occurred timestamp. Native purchase refunds will use their existing
`Refund.createdAt` timestamp.

A new dated commerce-refund record will be introduced for event and merchandise
refunds. The refund action will create this record in the same transaction that
updates the order and payment record. A data migration will backfill the one
existing refunded commerce order using its last-updated timestamp so its
historical refund remains represented exactly once. The cumulative
`refundedAmountCents` fields remain intact for reconciliation and refund limits.

Clicking either monthly card will open the existing Earnings analytics section
on the overview. The section will preserve the current Day, Week, Month, Year,
and custom-date controls and will show, for the selected range:

- gross revenue, refunds, and net revenue summary values;
- a daily net-revenue chart;
- a daily refunds chart;
- revenue distribution by offering type; and
- dated refund details linked to the affected client or order when available.

The range controls will preserve the active Earnings view and Sales panel while
changing periods. The existing lifetime sales ledger and refund history remain
available below the analytics section.

## Create Client Flow

The Clients page header will place a `Create client` button beside `Export
clients`. The button will open `/admin/members/new` inside the existing admin
shell.

Only an authenticated approved owner may access the page or execute its server
actions, matching the current admin authorization boundary.

The form will collect the same identity information as public signup:

- first name;
- last name;
- email;
- cell phone;
- birthday month; and
- birthday day.

Admin will not choose or see a member password. The new user will be created as
an `INVITED` member with no password hash, a member profile, and the existing
default notification preference. A unique activation link will be emailed to
the member. The member must use that link to choose a password and personally
accept the current waiver before booking. Admin does not sign the legal waiver
on the member's behalf.

Account creation will reject an existing email without modifying the existing
account. Every successful creation will record an audit log naming the acting
owner and new member.

The form may leave membership blank or select one qualifying active recurring
product. Intro trials, class packs, drop-ins, and events will not appear in the
membership selector.

## Membership Purchase Mode

`Purchase through Stripe` is the paid path. It will:

- validate the selected client has no qualifying current membership;
- validate that the product is active, qualifying, and has a Stripe price;
- create a pending Rhyze purchase linked to that client;
- create Stripe Checkout in subscription mode using the client's existing
  Stripe customer when present, or the client's email otherwise;
- keep payment-card entry on Stripe-hosted Checkout;
- use the existing webhook fulfillment path to create the subscription,
  membership, credits, payment records, revenue, receipts, and emails; and
- return management to the client's admin profile after success or
  cancellation.

Opening this flow does not charge an existing saved card automatically. The
checkout must be completed interactively. Private products with no Stripe price
may be assigned but cannot use the paid path.

If Stripe Checkout cannot be created, the pending purchase will be marked
failed and no membership or credit will be granted. When this happens during
new-client creation, the client account remains safely created and management
is sent to that profile with a clear payment error so the operation can be
retried without creating a duplicate client.

## Membership Assignment Mode

`Assign without charging` is the non-revenue path. It will:

- validate the selected client has no qualifying current membership;
- require a qualifying active recurring product;
- require a future access-end date and an admin reason;
- create a zero-dollar paid purchase marked as an admin assignment;
- create an `ACTIVE` membership linked to that zero-dollar purchase;
- create a linked credit account carrying the selected product's product kind,
  category rules, finite included-credit amount, or unlimited flag;
- set the membership and credit access end to the chosen date;
- create a grant ledger entry for finite-credit plans;
- record an audit log with the acting owner, plan, dates, and reason;
- send a purpose-specific email explaining that Rhyze assigned the membership,
  that no payment was charged, and when access ends; and
- add no dollars to revenue and create no Stripe subscription or automatic
  renewal.

Linking the assignment through a zero-dollar purchase is intentional: current
booking and cancellation rules obtain product kind and membership status
through the purchase-backed credit account. This ensures assigned VIP access
receives VIP cancellation behavior and assigned limited memberships reserve
credits correctly.

The action will use a database transaction and an advisory lock on the client
identifier so two simultaneous submissions cannot create two active
memberships.

## Existing Client Profile

The `Memberships` section on an existing client profile will add a `Start a
membership` panel only when the client has no qualifying `ACTIVE` or `TRIALING`
membership.

The panel will use the same product list and the same two actions as the create
client flow:

- `Continue to secure Stripe checkout`; or
- `Assign without charging` with access-end date and reason.

Existing pause, resume, freeze, cancellation-request review, historical
membership display, credits, payments, and class history will remain
unchanged. Automatic switching of an existing active plan will remain locked,
because current plan-change terms are not finalized and this request only
covers clients without a current membership.

## Error Handling and Safety

- Every server action will re-check owner authorization, client identity,
  product eligibility, and current membership state. Browser-submitted hidden
  values are never trusted.
- Duplicate-email and duplicate-membership attempts will return specific,
  non-destructive errors.
- Stripe failures will never create active local access.
- Assignment failures will roll back the purchase, membership, credit account,
  ledger, email queue entry, and audit log together.
- All mutations will revalidate the admin overview, client directory, client
  profile, member home, membership page, bookings page, and public schedule as
  applicable.
- No existing historical rows will be deleted or rewritten.

## Visual Direction

The new screens will extend the established Rhyze system rather than introduce
a new style: cream admin canvas, black structural panels, coral/orange/gold
status accents, condensed display headings, and high-contrast action labels.
The memorable interaction is the event-card rail; admin forms remain restrained
and operational. Paid and no-charge actions will be visually separated so an
owner cannot confuse a Stripe purchase with a complimentary assignment.

## Testing and Verification

Implementation will follow red-green-refactor cycles. Tests will cover:

- the shared active-membership predicate and distinct-user semantics;
- exclusion of intro trials, class packs, drop-ins, events, paused, past-due,
  cancelled, and expired memberships;
- dashboard-to-directory filter parity;
- New York monthly boundaries for the current-month revenue and refund cards;
- refund-date accounting, including commerce-refund backfill and prevention of
  double counting;
- Day, Week, Month, Year, and custom-date financial summaries and series;
- removal of past public event occurrences;
- carousel visibility, navigation boundaries, and accessible controls;
- create-client validation, duplicate email handling, activation email, and
  audit record;
- Stripe checkout parameters, client linkage, success/cancel destinations, and
  failed-checkout behavior;
- assignment validation, zero revenue, fixed end date, finite and unlimited
  credits, product linkage, audit record, email, and concurrency protection;
- refusal to add a second current membership; and
- visibility of the start-membership panel only for clients without a current
  qualifying membership.

Before any deployment request is considered, local verification must include
typecheck, the full automated test suite, a production build, responsive browser
checks of the home page and affected admin screens, and confirmation that the
working tree contains only intended changes.
