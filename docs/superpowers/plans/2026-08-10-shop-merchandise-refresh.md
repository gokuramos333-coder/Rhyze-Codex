# Shop Merchandise Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put five available front/back apparel products first on the Rhyze shop, keep all coming-soon merchandise below them, and enforce the approved $25 tank / $30 shirt pricing.

**Architecture:** Keep the existing static TypeScript merchandise catalog as the single source of truth. Extend each catalog item with an optional back image and explicit studio-availability copy, then make the existing product card switch between front and back images without adding online checkout.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest, Next Image.

## Global Constraints

- Preserve the current Rhyze dark/coral/gold visual design.
- Available merchandise says `Available at the studio in person` in a light-green box.
- Tank tops cost $25; short-sleeve shirts cost $30.
- Existing coming-soon items and the new #9/#10 shirt cost $30 and render after available merchandise.
- Merchandise remains studio-only; no Add to Cart or online checkout control is introduced.

---

### Task 1: Lock the catalog behavior with tests

**Files:**
- Create: `tests/unit/catalog/shop-merchandise.test.ts`
- Modify: `tests/unit/payments/commerce-orders.test.ts`

**Interfaces:**
- Consumes: `products: Product[]` and `priceMerchandiseCart(items)`.
- Produces: regression coverage for product order, image pairs, prices, and availability state.

- [ ] **Step 1: Write failing catalog tests**

Assert that the five available products precede every coming-soon product, have two image paths, and use the approved prices.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/unit/catalog/shop-merchandise.test.ts tests/unit/payments/commerce-orders.test.ts`

- [ ] **Step 3: Update the server-pricing fixture**

Use an available tank product and assert a $25 unit price.

- [ ] **Step 4: Run focused tests after implementation**

Expected: both test files pass.

### Task 2: Import the approved product photography

**Files:**
- Create: `public/shop/rhyze-up-tank-front.webp`
- Create: `public/shop/rhyze-up-tank-back.webp`
- Create: `public/shop/rhyze-logo-mauve-tee-front.webp`
- Create: `public/shop/rhyze-logo-mauve-tee-back.webp`
- Create: `public/shop/mind-body-soul-tank-front.webp`
- Create: `public/shop/mind-body-soul-tank-back.webp`
- Create: `public/shop/rhyze-tribe-tank-front.webp`
- Create: `public/shop/rhyze-tribe-tank-back.webp`
- Create: `public/shop/rhyze-logo-tank-front.webp`
- Create: `public/shop/rhyze-logo-tank-back.webp`
- Create: `public/shop/rhyze-logo-black-tee-front.webp`
- Create: `public/shop/rhyze-logo-black-tee-back.webp`

**Interfaces:**
- Consumes: the twelve user-supplied PNG files.
- Produces: optimized, stable public image paths referenced by the catalog.

- [ ] **Step 1: Convert each PNG to a web-sized WebP**

Preserve the full product view and use explicit front/back filenames.

- [ ] **Step 2: Verify every asset exists and is readable**

Run: `file public/shop/*.webp`.

### Task 3: Implement the catalog and front/back card

**Files:**
- Modify: `lib/products.ts`
- Modify: `components/sections/ProductCard.tsx`
- Modify: `app/shop/page.tsx`

**Interfaces:**
- Consumes: `Product.image`, `Product.backImage`, `Product.comingSoon`, and `Product.availabilityLabel`.
- Produces: available products first, a separately titled coming-soon section, image-view controls, and conditional status copy.

- [ ] **Step 1: Extend `Product` and replace the catalog entries**

Add the five available image pairs, add #9/#10 as coming soon, reprice all existing coming-soon items to $30, and keep available products first.

- [ ] **Step 2: Add accessible front/back controls to `ProductCard`**

Show `Front` and `Back` buttons only when a back image exists; update the image and alt text when selected.

- [ ] **Step 3: Render separate available and coming-soon sections**

The first section contains available products; the second section contains coming-soon products.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/unit/catalog/shop-merchandise.test.ts tests/unit/payments/commerce-orders.test.ts tests/unit/payments/merchandise-checkout-surface.test.ts`

### Task 4: Verify the finished shop

**Files:**
- Verify: `app/shop/page.tsx`
- Verify: `components/sections/ProductCard.tsx`
- Verify: `lib/products.ts`

**Interfaces:**
- Consumes: the finished local implementation.
- Produces: launch-quality verification evidence and a local preview link.

- [ ] **Step 1: Run static verification**

Run: `npm run typecheck`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`.

- [ ] **Step 3: Run the production build**

Run: `npm run build`.

- [ ] **Step 4: Inspect `/shop` at desktop and mobile widths**

Confirm product order, front/back controls, exact copy, pricing, and responsive layout.
