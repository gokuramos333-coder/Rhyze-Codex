# Somble Account Activation Operations

Imported Somble members remain attached to their existing Rhyze `User` record. Never create shared passwords and never ask members to create a duplicate account.

## Safety gates

Do not send activation emails until all of these are true:

1. The final Somble export has been imported and reconciled against members, memberships, credits, purchases, future bookings, and rosters.
2. The production database has a verified backup.
3. `ACCOUNT_ACTIVATION` is approved in Admin → Email Previews.
4. `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NEXT_PUBLIC_APP_URL`, `JOB_SECRET`, and the email worker are verified in the production environment.
5. The production `NEXT_PUBLIC_APP_URL` points to the intended Rhyze domain.
6. One designated test member receives, opens, and completes an activation link successfully.
7. Gui explicitly authorizes the batch send and the production deployment/cutover.

## Dry run

```bash
npm run somble:send-claims -- --dry-run
```

Dry run is also the default when no mode is supplied. It reports eligible and skipped imported accounts and performs no token or email writes.

## Apply only after authorization

```bash
npm run somble:send-claims -- --apply
```

Apply creates a hashed, single-use activation token valid for 30 days and queues one branded `ACCOUNT_ACTIVATION` email per eligible imported member. Raw token values are never printed in the report.

## Reissue

Reissuing replaces the prior unused claim token. The old link becomes invalid. Always re-run dry mode and verify the recipient before an authorized reissue.

## No-deploy rule for the current build phase

Do not deploy these changes to Netlify and do not run `--apply` until Gui explicitly requests the deployment and activation send.
