# Rhyze Email Template Editing Design

## Goal

Use the real Rhyze logo in every email, standardize the tagline and studio address, and allow an approved Admin to edit and save recipient-visible template copy without breaking dynamic account, class, or payment data.

## Decisions

- The email header uses `/brand/rhyze-logo-header.png` through the public Site 2 URL.
- The canonical tagline is `In Rhythm, We Rise.` everywhere in email HTML and plain text.
- The canonical footer address is:
  `The Shoppes at Lafayette`, `75 NJ-15, Lafayette Township, NJ 07848`, `Building J`.
- Admin may edit subject, eyebrow, headline, greeting, body paragraphs, callout title/body, CTA label, and closing.
- CTA destinations and fact rows stay code-controlled so editing copy cannot break navigation or remove live class/payment facts.
- `{{fieldName}}` placeholders in saved copy are replaced from each email's payload; unknown placeholders remain visible so errors are reviewable.
- Saving an edit records the current Admin and immediately approves that saved template revision.
- All current baseline templates are approved during the migration, as explicitly requested.

## Data and Rendering

`EmailTemplateReview` stores an optional JSON copy override beside its approval metadata. A focused override helper validates and merges saved copy over the catalog-generated presentation. Preview, test-send, queued delivery, and direct contact delivery all use the same helper.

## Safety

- Only owner/Admin sessions can save edits.
- Server validation limits field and body sizes.
- HTML output remains escaped by the shared renderer.
- Automatic queued delivery remains controlled by `EMAIL_DELIVERY_ENABLED`.

## Verification

Unit tests cover logo/tagline/address, placeholder interpolation, persisted editor fields, approval-on-save, worker override usage, and the baseline approval migration. Full typecheck, tests, production build, and Netlify Site 2 deployment follow.
