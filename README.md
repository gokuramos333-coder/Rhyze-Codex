# Rhyze Fitness — Marketing Site

Production-ready marketing site for **Rhyze Fitness**, a boutique dance / yoga /
HIIT studio opening Summer 2026 in Lafayette, NJ. Co-founded by Vanessa Ramos
and Melissa Llanos.

The site's primary job is converting visitors into **$7 / 7-day trial members**.
Booking, payments, and account features are stubbed — see TODOs below.

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

None required for local development. When real integrations land (booking,
checkout, email), keys go in `.env.local` — don't commit that file; see
`.gitignore`.

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
5. Environment variables: none at launch. Add integration keys later under
   **Project → Settings → Environment Variables**.
6. On merge to `main`, Vercel rebuilds and deploys.

OG image, sitemap, and robots are generated automatically by Next at build
time — no extra config.

## Accessibility & SEO

- Semantic landmarks on every page, skip-to-content link in `app/layout.tsx`
- Every interactive element has a visible focus ring (`.focus-ring` utility)
- Forms use labelled inputs and zod-backed error messages
- `aria-*` labels on icon-only buttons (cart, hamburger, social)
- Metadata set per page via `generateMetadata` / exported `metadata`
- Dynamic OG image at `/opengraph-image`, dynamic favicon at `/icon`

## Outstanding TODOs (integration work)

Each TODO is live in the codebase — grep for `TODO` to find them:

- **Vanessa's final bio** — `lib/instructors.ts` (placeholder bio in place)
- **Booking system** (Mindbody / Arketa / Momence TBD) — `/book/[slug]` is a
  "Coming Soon" placeholder; `JoinForm` submit currently logs and shows a
  success state
- **Checkout integration** — Shopify or Stripe — `components/sections/CartDrawer.tsx`
  checkout modal stub
- **Sign In / member portal** — `app/signin/page.tsx` placeholder
- **Newsletter capture** — Mailchimp or Klaviyo — `app/api/newsletter/route.ts`
  currently only logs to the console
- **Contact form delivery** — SendGrid or Resend — `app/api/contact/route.ts`
  currently only logs to the console
- **Gallery photography** — `components/sections/GalleryGrid.tsx` placeholder
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
