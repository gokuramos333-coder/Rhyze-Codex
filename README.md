# Rhyze Fitness, Marketing Site

Production-ready marketing site for **Rhyze Fitness**, a boutique dance / yoga /
HIIT studio opening Summer 2026 in Lafayette, NJ. Co-founded by Vanessa Ramos
and Melissa Llanos.

The site's primary job is converting visitors into **$7 / 7-day trial members**.
Booking, payments, and account features are stubbed, see TODOs below.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** with a custom Rhyze palette and `rhyze-gradient` utility
- **Framer Motion** for hero, mobile drawer, parallax, and accordion transitions
- **react-hook-form + zod** for Contact and Join forms
- **zustand** (persisted) for the cart drawer
- **lucide-react** for icons
- Fonts: **Bebas Neue** (display) + **Inter** (body) via `next/font/google`

## Commands

```sh
npm install       # install deps
npm run dev       # start dev server at http://localhost:3000
npm run build     # production build
npm run start     # run the production build
npm run lint      # next lint
npm run typecheck # tsc --noEmit
```

`pnpm` also works if preferred; the plan's first choice was pnpm but we fell
back to npm for this build because pnpm wasn't on the dev machine.

## Environment Variables

Local development defaults to local file storage. Production uploads require
durable S3-compatible object storage; keys go in `.env.local` or the hosting
provider's encrypted environment settings and must never be committed.

Set `STORAGE_DRIVER=s3` together with `STORAGE_S3_BUCKET`,
`STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY_ID`, and
`STORAGE_S3_SECRET_ACCESS_KEY`. Set `STORAGE_S3_ENDPOINT` for Cloudflare R2 or
another S3-compatible provider. Instructor/member photos are served through
the public media route. Insurance and CPR documents remain private and are
downloaded only through the authenticated credentials route.

## Project Layout

```
app/                  # Next.js App Router routes + route handlers
  api/                # Stub API routes (contact, newsletter)
  classes/[slug]/     # Dynamic class detail
  book/[slug]/        # Booking placeholder
  sitemap.ts robots.ts opengraph-image.tsx icon.tsx apple-icon.tsx
components/
  layout/             # Header, Footer, MobileNav, CartButton
  sections/           # Page-level sections (Hero, ScheduleFull, CartDrawer, …)
  ui/                 # Primitives (Button, Badge, Input, Modal, Accordion)
lib/                  # Content-driven data (editable without touching JSX)
  classes.ts          # 12 class catalog entries
  schedule.ts         # Weekly schedule sample data
  instructors.ts      # Vanessa + Melissa bios
  products.ts         # Shop SKUs
  pricing.ts          # 4 tiers + $7 trial + member perks
  site.ts             # Global site constants (address, hours, nav)
  cart.ts             # zustand cart store
  cn.ts               # clsx + tailwind-merge helper
public/
  brand/              # Logos (dark + light background versions)
  founders/           # Founder photography
  shop/               # Product photography
  reference/          # Design reference (not published on the public site)
```

## Editing Content

Most copy changes happen in `lib/*.ts`, not in JSX:

| I want to…                          | Edit                     |
| ----------------------------------- | ------------------------ |
| Add / edit a class                  | `lib/classes.ts`         |
| Change schedule / sample slots      | `lib/schedule.ts`        |
| Update a pricing tier or perk       | `lib/pricing.ts`         |
| Add / update an instructor          | `lib/instructors.ts`     |
| Add a product                       | `lib/products.ts`        |
| Change address, hours, phone, email | `lib/site.ts`            |
| Change studio policies              | `app/policies/page.tsx`  |
| Change the About story              | `app/about/page.tsx`     |

Drop photos into the right `public/` folder and reference them via absolute
paths (`/founders/whoever.jpg`).

## Deployment (Vercel)

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Framework preset: **Next.js** (auto-detected).
4. Root directory: repo root.
5. Add the production environment variables from `.env.example` under
   **Project → Settings → Environment Variables**. Stripe, email, storage, auth,
   and database secrets are required for their corresponding live features.
6. On merge to `main`, Vercel rebuilds and deploys.

OG image, sitemap, and robots are generated automatically by Next at build
time, no extra config.

## Accessibility & SEO

- Semantic landmarks on every page, skip-to-content link in `app/layout.tsx`
- Every interactive element has a visible focus ring (`.focus-ring` utility)
- Forms use labelled inputs and zod-backed error messages
- `aria-*` labels on icon-only buttons (cart, hamburger, social)
- Metadata set per page via `generateMetadata` / exported `metadata`
- Dynamic OG image at `/opengraph-image`, dynamic favicon at `/icon`

## Stripe activation

Stripe Checkout, Billing, Customer Portal, signed webhooks, refunds, event
tickets, and merchandise orders are implemented. Keep test keys in local and
preview environments until the full test purchase/refund checklist passes.

1. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the environment.
2. Optionally add `STRIPE_PORTAL_CONFIGURATION_ID` for a branded portal setup.
3. Register `https://YOUR_DOMAIN/api/stripe/webhook` in Stripe with the events
   handled in `lib/payments/webhook-processor.ts`.
4. Run `npm run stripe:sync-catalog` to create/reuse Stripe products and prices
   and save the resulting Price IDs to Rhyze products.
5. Complete a test-mode membership, class/event, merchandise, failed-renewal,
   cancellation, and refund flow before replacing test keys with live keys.

## Outstanding TODOs (integration work)

Each TODO is live in the codebase, grep for `TODO` to find them:

- **Vanessa's final bio**, `lib/instructors.ts` (placeholder bio in place)
- **Booking system** (Mindbody / Arketa / Momence TBD), `/book/[slug]` is a
  "Coming Soon" placeholder; `JoinForm` submit currently logs and shows a
  success state
- **Sign In / member portal**, `app/signin/page.tsx` placeholder
- **Newsletter capture**, Mailchimp or Klaviyo, `app/api/newsletter/route.ts`
  currently only logs to the console
- **Contact form delivery**, SendGrid or Resend, `app/api/contact/route.ts`
  currently only logs to the console
- **Gallery photography**, `components/sections/GalleryGrid.tsx` placeholder
  tiles; swap for real shots once photography lands

## Decisions Locked

- **Dark-mode-first.** The site is always dark; there's no light-mode toggle.
- **$7 trial is the primary conversion path.** Every CTA routes there.
- **All booking URLs point to `/book/[slug]`** until the booking system ships.
- **Cart state persists** in localStorage via zustand's `persist` middleware.

## Opening Day Checklist

Before flipping the switch:

- Replace the Vanessa bio
- Wire booking, checkout, sign-in, newsletter, and contact-form integrations
- Swap gallery placeholders for real studio photography
- Refresh schedule data with real opening-week slots
- Point DNS at Vercel and update `site.url` if the production domain differs

🧡
