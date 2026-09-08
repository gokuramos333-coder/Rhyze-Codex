# Rhyze Email System Design

## Goal

Give Rhyze a complete, consistent transactional email catalog that owners can preview and test before automatic delivery is enabled.

## Visual direction

Emails use Rhyze's existing black, coral, gold, and warm-cream palette. The layout is a narrow editorial letter: small Rhyze wordmark, one strong display headline, friendly concise copy, one primary action, and a practical footer. The signature device is a slim coral-to-gold rhythm line rather than decorative illustrations, keeping every message recognizable and dependable in email clients.

## Catalog

The catalog covers account welcome and password reset; booking confirmation, reminder, cancellation, transfer, waitlist join, waitlist promotion, class update and class cancellation; membership purchase, one-time purchase, receipt, renewal, failed payment, refund, trial ending, membership requests and membership cancellation; instructor approval request, approval, denial, missing documents and credential review; admin/member conversation notices; campaigns and contact acknowledgements. Agreement reminders are intentionally excluded because acceptance is required during account creation.

## Sender and replies

All Rhyze transactional email is sent as `Rhyze Fitness <melissa@rhyzefit.com>`. Replies go to `melissa@rhyzefit.com`, except conversation messages, which also retain their generated inbound archive reply address so the reply is attached to the correct permanent thread.

## Preview and testing

An owner-only `/admin/email-previews` page lists every template. Owners can open a rendered desktop-width preview, review its subject and trigger, and send a test to an explicitly entered address. Test sends use Resend directly, are marked as tests, are archived in `EmailMessage`, and never enable or drain the transactional queue.

## Safety and errors

The test-send action requires an approved owner, validates the template and recipient, refuses to send when Resend is unconfigured, and reports success or failure honestly. HTML escapes all dynamic customer content. Automatic delivery remains controlled independently by `EMAIL_DELIVERY_ENABLED`.

## Testing

Unit tests verify catalog completeness, branded rendering, human-readable copy without internal IDs or fixed individual names, preview access/navigation, test-send feedback, and lifecycle event queuing. Existing notification and build checks remain required.
