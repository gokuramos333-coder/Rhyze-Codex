# Rhyze Fitness — Website Snapshot

Snapshot date: 2026-05-12
Project path: `/Users/gokuramos/Projects/rhyze-fitness`
Stack: Next.js 14 (App Router, TypeScript), Tailwind, Framer Motion, react-hook-form + zod, zustand

---

## Site identity

- **Name:** Rhyze Fitness
- **Tagline:** In Rhythm We Rise
- **Concept:** Boutique dance, yoga, and HIIT studio
- **Location:** The Shoppes at Lafayette, 75 NJ-15, Lafayette Township, NJ 07848
- **Phone:** (201) 921-7133
- **Instagram:** @rhyze.fitness
- **Hours:** Mon-Fri 7am-8pm, Sat-Sun 8am-2pm
- **Opening:** Summer 2026
- **Founders:** Vanessa Ramos (Founder & Creative Director) and Melissa Llanos (Co-Founder · Instructor)
- **Primary conversion path:** $7, 7-day unlimited trial

## Brand

- **Palette:** rhyze-black `#0A0A0A`, rhyze-charcoal `#1A1A1A`, rhyze-coral `#F05A3C`, rhyze-orange `#F7931E`, rhyze-gold `#FFC72C`, rhyze-cream `#F5F1E8`
- **Gradient:** coral to orange to gold (left to right)
- **Fonts:** Bebas Neue (display headings), Inter (body)
- **Logo:** `public/brand/rhyze-logo.png` (transparent-background variant). Header displays at `h-40` (160px) inside an `h-44` (176px) header bar.

---

## Pages

### / (Home)
Sections in order:
1. **Hero** with `main-intro.jpg` background photo at 50% opacity, dark horizontal gradient overlay, and an animated sunrise glow. Headline "IN RHYTHM WE RISE" with the word "RHYTHM" in the brand gradient. Eyebrow "Opening Summer 2026 · Lafayette, NJ". CTA buttons: "Start Your $7 Trial" and "View Class Schedule".
2. **Welcome copy** — "WHERE SUSSEX COMES TO MOVE" with body copy about bringing a fresh, high-energy fitness experience to Sussex County.
3. **Three Pillars** — Dance / Yoga & Pilates / Strength & HIIT.
4. **Schedule preview** — a few sample slots from the weekly schedule.
5. **Pricing teaser** — link out to the full pricing page.
6. **Founders strip** — "MEET VANESSA & MELISSA" section with `meet-vanessa-and-melissa-clip.MOV` autoplay video (object-contain so the full clip fits the frame).
7. **Location block** — address, hours, and map link.
8. **Final CTA** — push to $7 trial.

### /about
- Hero: "WE ARE RHYZE" + "Three ideas built this studio."
- **01 · The Mission — More Than A Studio** with `more-than-a-studio.jpg` cropped to the right so the "RHYZE TOGETHER" neon wall is visible.
- **02 · The Vibe — Come As You Are** with `come-as-you-are.gif` (animated, unoptimized).
- **03 · The Story — Dreams Over Coffee** with parallax `dreams-over-coffee.jpg`, narrative copy, CTAs to instructors and join page.

### /classes
- Hero "CLASSES" headline with `classes.jpg` 16:9 hero image.
- Level guide (Foundation / Signature / Peak).
- Full class list grid (12 classes across Dance, Yoga & Pilates, Strength & HIIT).
- ScheduleFull component (weekly schedule).

### /classes/[slug]
Dynamic detail page for each of 12 classes. Shows category badge, level badge, duration, name, tagline, description, "What to Expect", "What to Bring", instructor note, upcoming sessions, and Book CTA.

### /pricing
- "PICK YOUR RHYTHM" hero.
- Prominent $7 / 7-day unlimited trial banner.
- Four tiers:
  - **Single Class (Drop-In)** — $30 / class
  - **The Weekly Rhyzer** — $99 / mo (~$24.75 / class)
  - **The Twice-A-Week** — $169 / mo (~$21.12 / class) — flagged Most Popular
  - **The Rhyze Up Unlimited** — $219 / mo (~$18 / class at 3x/week)
- Member perks card: Glow-in-the-Dark Pop-ups, Buddy Pass, Retail Discount (10% off Rhyze gear).

### /instructors
Card list with Vanessa and Melissa.

**Vanessa Ramos** — Founder & Creative Director
- Quote: "Find the power in your own rhythm."
- Bio: Foundation in movement from teen years, certified personal trainer transitioning into group exercise, nearly two decades in dance fitness, professional showgirl, founder of Bastet Ent (specialty-acts agency). As wife and mother of two, builds Rhyze to bridge high-end performance and boutique fitness, prioritizing inclusion and belonging.
- Specialties: Dance · HIIT
- Photo: `instructor-vanessa.jpg` (object-contain so full portrait fits)
- IG: @vanessaramos.rhyze
- Email: vanessa@rhyzefit.com

**Melissa Llanos** — Co-Founder · Instructor
- Quote: "Your only limit is the one you build yourself. Let's break it down together."
- Bio: Born and raised in Colombia, lifelong dancer carrying Latin rhythms. After a lifetime of movement, finally stepping into the teaching role. Authentic soul and high energy on the floor.
- Specialties: Latin Dance · Choreography
- Photo: `instructor-melissa.jpg`
- IG: @mllanos.rhyze
- Email: melissa@rhyzefit.com

### /shop
Six product cards in the launch capsule, all at $35:
1. Rhyze Cropped Tee (Cream) — `merch-1.png`
2. Rhyze Tribe Cropped Tee (Black) — `merch-2.png`
3. Flow Over Force Cropped Tee (Grey) — `merch-3.png`
4. Mind · Body · Soul Cropped Tee (Black) — `merch-4.png`
5. Rhyze Tribe Boxy Tee (Sand) — `merch-5.png`
6. Rhyze Hat — no image, "coming soon" placeholder.

Member discount card at the bottom (10% off for all members at checkout).

### /gallery
Instagram-feed driven page.
- Header strip with the `@rhyze.fitness` handle and Follow button.
- If `NEXT_PUBLIC_LIGHTWIDGET_URL` env var is set, embeds the LightWidget iframe of the live IG feed.
- Otherwise, renders 8 styled fallback tiles, each linking to the profile (current behavior; LightWidget not yet configured).
- "WANT A SNEAK PEEK?" CTA card at the bottom.

### /contact
- Headline "SAY HELLO" with gradient on "HELLO".
- Subhead: "Got a question, an idea, or just want to say hi? We'd love to hear from you…"
- Left column: address, phone, founder emails (vanessa@rhyzefit.com, melissa@rhyzefit.com), Instagram handle, hours. Founder photo with "SEE YOU ON THE FLOOR" overlay.
- Right column: contact form (name, email, topic, message). Form posts to `/api/contact` in production; in static export it logs and shows the error state.
- LocationBlock embed underneath.

### /join
$7 trial join form. FAQ accordion below covering parking, what to wear, locker rooms, first-class etiquette.

### /book/[slug]
Booking placeholder page for each of 12 classes. "BOOKING LAUNCHES WITH THE STUDIO" message with link back to /classes and $7 trial CTA. Slated for Mindbody / Arketa / Momence integration.

### /policies
Waiver, cancellation, arrival, age, and health policies. Anchor nav at the top jumps between sections.

### /signin
"Members Only, Coming Soon" placeholder. Slated for real member portal.

### /not-found
404 page. "The page you're looking for doesn't exist, but the floor's still open."

---

## Key design decisions

- Dark-mode-first. No light-mode toggle.
- Every CTA routes to the $7 trial as the primary conversion path.
- Cart state persisted in localStorage via zustand's `persist` middleware.
- All long dashes (em and en) have been stripped sitewide.

---

## Outstanding integrations (TODOs in code, grep `TODO`)

- **Booking system** (Mindbody / Arketa / Momence) — `/book/[slug]` is a placeholder; `JoinForm` submit currently logs and shows success state.
- **Checkout** (Shopify or Stripe) — `CartDrawer` checkout modal stub.
- **Sign-in / member portal** — `/signin` placeholder.
- **Newsletter capture** (Mailchimp or Klaviyo) — `/api/newsletter` logs only.
- **Contact form delivery** (SendGrid or Resend) — `/api/contact` logs only.
- **LightWidget IG feed** — set `NEXT_PUBLIC_LIGHTWIDGET_URL` in `.env.local` to go live.

---

## Asset inventory (public/)

- `brand/rhyze-logo.png` (transparent), `rhyze-logo-dark.png`, `rhyze-logo-light.png`
- `founders/`: `main-intro.jpg`, `classes.jpg`, `more-than-a-studio.jpg`, `come-as-you-are.gif`, `dreams-over-coffee.jpg`, `instructor-vanessa.jpg`, `instructor-melissa.jpg`, `founder-vanessa-1.jpg`, `founder-melissa-1.jpg`, `founders-vanessa-melissa-1.jpg`, `founders-vanessa-melissa-2.jpg`, `founders-vanessa-melissa-3.jpg`, `meet-vanessa-and-melissa-clip.MOV`
- `shop/`: `merch-1.png` through `merch-5.png`
- `reference/`: `location.png`, `prices.png` (not published on the site)

---

## Static export (deployable)

`/Users/gokuramos/Projects/rhyze-fitness/out/` — 37 HTML pages, ~52 MB, drag-and-drop ready for Netlify or any static host.

To regenerate after edits, run from the project root:
```sh
mv app/api /tmp/api-stash
# add output: 'export', trailingSlash: true, images.unoptimized: true to next.config.mjs
npm run build
mv /tmp/api-stash app/api
git checkout next.config.mjs   # restore config
```

---

## Files I most often touch when editing the site

| Want to change… | Edit |
|---|---|
| Founder bios, photos, IG handles | `lib/instructors.ts` |
| Class catalog (12 classes) | `lib/classes.ts` |
| Weekly schedule slots | `lib/schedule.ts` |
| Pricing tiers, $7 trial, perks | `lib/pricing.ts` |
| Shop SKUs / prices / images | `lib/products.ts` |
| Address, hours, phone, IG, emails, nav | `lib/site.ts` |
| Header (logo size, nav) | `components/layout/Header.tsx` |
| Footer | `components/layout/Footer.tsx` |
| Hero (home page) | `components/sections/Hero.tsx` |
| About page sections | `app/about/page.tsx` |
| Contact page copy | `app/contact/page.tsx` |
