# Rhyze Fitness, Session Changelog

Date: 2026-05-06
Scope: One working session. Every change applied directly to `main` working tree (no commits made by Claude).

---

## 1. Instructor data (`lib/instructors.ts`)

### Vanessa Ramos
- **Role:** `Co-Founder · Instructor` → `Founder & Creative Director`
- **Quote:** `Movement is my love language, come write yours with us.` → `Find the power in your own rhythm.`
- **Bio:** Replaced placeholder with the final two-paragraph bio covering her teen-years foundation, twenty-year dance-fitness career, Bastet Ent venture, and the mission behind Rhyze.
- Removed the `// TODO: Replace with Vanessa's final bio` comment and the `bioIsPlaceholder: true` flag.
- **Photo:** `/founders/founder-vanessa-1.jpg` → `/founders/instructor-vanessa.jpg`
- **Instagram:** `vanessa.ramos` → `vanessaramos.rhyze`

### Melissa Llanos
- **Photo:** `/founders/founder-melissa-1.jpg` → `/founders/instructor-melissa.jpg`
- **Instagram:** `melissa.llanos` → `mllanos.rhyze`

### Card layout (`components/sections/InstructorCard.tsx`)
- Switched the photo container from `object-cover` to `object-contain` so the full portrait is visible (Vanessa's photo is 2252×4000, narrower than the 4:5 frame, and was cropping her hair).
- Container background set to `bg-rhyze-black/40` so the side letterbox bars match the card.
- Removed the bottom gradient overlay (was designed for cover photos; redundant with contain).

---

## 2. Branding (logo)

- **Generated** `public/brand/rhyze-logo.png`, a transparent-background variant produced from `rhyze-logo-dark.png` via `sharp`. Pixels with `max(R,G,B) < 32` are set to alpha 0; values 32-80 fade proportionally (soft fringe). The original `-dark` and `-light` PNGs are still in place as fallbacks.

### Header (`components/layout/Header.tsx`)
- Logo `src` switched to `/brand/rhyze-logo.png`.
- Logo height: `h-9` (36px) → `h-14` (56px) → finally `h-40` (160px) per the "3x bigger" request.
- `width`/`height` props updated to `168×168` for next/image's intrinsic sizing.
- Header bar height: `h-20` (80px) → `h-44` (176px) so the larger logo fits with breathing room.

### Layout offsets (`app/layout.tsx`, `app/page.tsx`)
- The fixed-header spacer `pt-20` → `pt-44`.
- The home page's matching negation `-mt-20` → `-mt-44` (and the comment was updated).

### Footer (`components/layout/Footer.tsx`)
- Logo `src` switched to `/brand/rhyze-logo.png`.
- Logo height: `h-12` → `h-16` → `h-28` (per "a bit bigger").

---

## 3. Photography mapping

Named files in `public/founders/` were placed onto matching pages by filename → section title:

| File | Page / Section | Notes |
|------|----------------|-------|
| `classes.jpg` | `app/classes/page.tsx` hero | New 16:9 hero added below the H1 with bottom-fade gradient. |
| `more-than-a-studio.jpg` | `app/about/page.tsx` 01 · The Mission | Replaced `founders-vanessa-melissa-3.jpg`. Crop later set to `object-right` so the "RHYZE TOGETHER" neon wall and overhead lighting are visible. |
| `come-as-you-are.gif` | `app/about/page.tsx` 02 · The Vibe | Replaced `founders-vanessa-melissa-1.jpg`. `unoptimized` prop set so the GIF animates. |
| `dreams-over-coffee.jpg` | `app/about/page.tsx` 03 · The Story (parallax) | Replaced `founders-vanessa-melissa-2.jpg`. |
| `instructor-vanessa.jpg` / `instructor-melissa.jpg` | `lib/instructors.ts` | See Instructor section above. |
| `main-intro.jpg` | `components/sections/Hero.tsx` background | Full-bleed `<Image fill priority>`, `opacity-50`, plus a horizontal `from-black/90 via-black/70 to-black/40` gradient and a flat `bg-rhyze-black/40` overlay so the "IN RHYTHM WE RISE" headline still pops. The existing animated sunrise glow was toned to `opacity-60`. |
| `meet-vanessa-and-melissa-clip.MOV` | `components/sections/FoundersStrip.tsx` | Replaced the `<Image>` with a `<video>` element using `autoPlay muted loop playsInline preload="metadata"`. Object fit set to `object-contain` per the "fit fully" request; container background set to `bg-rhyze-black/40` to match the letterbox bars. The right-edge color glow overlay was removed. |

> Note: `main-intro.jpg` and `classes.jpg` are byte-identical (519,337 bytes, same date). Both are currently used as different page assets. Replace one when you have a distinct intro photo.

> Note: the `.MOV` file is 11MB. Modern browsers usually play H.264-in-MOV inline, but for best compatibility (Linux Chrome/Firefox, older Android) consider transcoding to MP4 + WebM later.

---

## 4. Shop catalog (`lib/products.ts`)

### Added three new products
- `flow-over-force-cropped-tee-grey`, `merch-3.png`
- `mind-body-soul-cropped-tee-black`, `merch-4.png`
- `rhyze-tribe-boxy-tee-sand`, `merch-5.png`

All three: sizes `XS`-`XXL`, full descriptions written from the photo content. Inserted before the "coming soon" hat.

### Pricing
- All six products unified to **$35** (was a mix of $30/$32/$34/$35).

### Renames
- `Rhyze Up Dad Hat` → `Rhyze Hat`. The internal `id: 'rhyze-up-dad-hat'` was kept as a stable cart slug.

The `/shop` page auto-renders the array, so no JSX changes were needed.

---

## 5. Gallery → Instagram feed

### New component (`components/sections/InstagramFeed.tsx`)
- Header strip with the `@rhyze.fitness` handle and a "Follow on Instagram" button.
- If `process.env.NEXT_PUBLIC_LIGHTWIDGET_URL` is set, renders a `<iframe>` with that URL, designed for LightWidget's free embed.
- Otherwise, renders 8 IG-styled fallback tiles, each linking to the public profile, so the page never looks broken.
- Also exports `<InstagramFeedCTA>`, the "WANT A SNEAK PEEK?" card pulled into the same module for cohesion.

### Page swap (`app/gallery/page.tsx`)
- Replaced `<GalleryGrid>` with `<InstagramFeed>` + `<InstagramFeedCTA>`.
- Updated metadata and intro copy: "Straight from our Instagram timeline, the build, the classes, the community."
- `components/sections/GalleryGrid.tsx` is left in place but no longer imported (rollback path).

### To enable live feed (5-min setup)
1. Sign up free at https://lightwidget.com.
2. Create a widget pointed at `@rhyze.fitness`, pick a 4-column grid layout.
3. Copy the widget URL: `https://cdn.lightwidget.com/widgets/<YOUR_ID>.html`.
4. Add to `.env.local`:
   ```
   NEXT_PUBLIC_LIGHTWIDGET_URL=https://cdn.lightwidget.com/widgets/<YOUR_ID>.html
   ```
5. Restart the dev server.

> Why not the Instagram Graph API? It works but requires a Meta business account, app config, long-lived token, and a refresh job. LightWidget covers the marketing-site need with watermarked free tier; a Graph API swap is a future-day swap.

---

## 6. Contact page (`app/contact/page.tsx`)

- Headline: `SAY HI` → `SAY HELLO` (gradient stays on `HELLO`).
- Subhead replaced with:
  > Got a question, an idea, or just want to say hi? We'd love to hear from you. Whether you're booking your first class, planning a private event, or asking about birthday parties and corporate sessions. We answer every message, usually within 24 hours.

---

## 7. `hello@rhyzefit.com` removed everywhere

### Source of truth
- `lib/site.ts`, dropped `general: 'hello@rhyzefit.com'` from the `emails` object. Kept `vanessa@rhyzefit.com` and `melissa@rhyzefit.com`.

### Surface-level cleanup
- `app/contact/page.tsx`, removed the general-email row from the contact details panel; only founder addresses now shown.
- `components/layout/Footer.tsx`, removed the email social icon (top of column) and the email row in the address block; pruned the now-unused `Mail` import.
- `components/sections/ContactForm.tsx`, error toast no longer references the address (now just "Please try again in a moment.").
- `components/sections/CartDrawer.tsx`, checkout-fallback line points to `/contact` page instead of an email.
- `app/policies/page.tsx`, "Questions? Email …" replaced with a link to `/contact`.

---

## Outstanding items / suggestions

- **Vanessa's `Founder & Creative Director` title** is now asymmetric with Melissa's `Co-Founder · Instructor`. Confirm whether you want to retitle Melissa for parity.
- **`main-intro.jpg` and `classes.jpg`** are the same file. Provide a distinct home-hero photo when ready.
- **`meet-vanessa-and-melissa-clip.MOV`**, consider transcoding to MP4 + WebM and adding a poster image for cross-browser reliability and faster initial paint.
- **`components/sections/GalleryGrid.tsx`** is unreferenced after the IG feed swap. Safe to delete when you're sure you don't want the placeholder grid back.
- **LightWidget setup** is required to make the gallery feed go live; until then it shows the styled fallback tiles.
- **README TODOs still open:** booking system (`/book/[slug]`), checkout integration (Shopify/Stripe), member portal (`/signin`), newsletter capture (Mailchimp/Klaviyo), contact form delivery (SendGrid/Resend).

---

## Verification

`npm run typecheck` was run after each functional change in this session and passed clean each time. No unit tests exist in the repo. Browser verification was manual via the dev server at `http://localhost:3000`.

## Files touched (full list)

- `lib/instructors.ts`
- `lib/products.ts`
- `lib/site.ts`
- `app/layout.tsx`
- `app/page.tsx`
- `app/about/page.tsx`
- `app/classes/page.tsx`
- `app/contact/page.tsx`
- `app/gallery/page.tsx`
- `app/policies/page.tsx`
- `components/layout/Header.tsx`
- `components/layout/Footer.tsx`
- `components/sections/Hero.tsx`
- `components/sections/FoundersStrip.tsx`
- `components/sections/InstructorCard.tsx`
- `components/sections/ContactForm.tsx`
- `components/sections/CartDrawer.tsx`
- `components/sections/InstagramFeed.tsx` (new)
- `public/brand/rhyze-logo.png` (new, generated)
