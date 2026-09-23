# Amali checkout release continuation

## Scope

Deploy the reviewed one-time checkout fix `f8096fcc125e9c9cbb737d4482b9e7a5dc7abd0e` through the guarded workflow. No checkout sessions, payments, retries, bookings, or entitlement changes are authorized for verification. User explicitly approved temporary PAT production database access for this release, restored OFF after every attempt.

## Initial attempt

Production was rechecked as READY, production context, deploy `6ab2a8b3789eb5b336e1a842`, source `6c20eaa`. Clean-source archive ran all 1,284 tests with zero skips, typecheck, lint, Prisma validation and production build. Authenticated portals, 36 assets and LIVE Stripe checks passed. The managed application binding's table privileges passed a read-only transaction.

Publication was blocked before upload by configuration fingerprint comparison. Receipt: `.releases/f8096fcc125e-VBtm7N/release.json`. Permission was restored OFF and confirmed by the API's `netlifydb_readonly` binding. Production did not change.

## Necessary guard correction

Two consecutive read-only Netlify environment responses returned different record ordering with identical records. Raw JSON hashing incorrectly treated this as configuration drift. The shared fingerprint now normalizes object keys and the unordered environment-record, scope and context-value lists. It preserves every field and duplicates; other arrays retain order. Both release preflight/recheck and the build plugin use the same fingerprint. This does not bypass any guard or alter payment behavior.

- Regression reproduced the false rejection before the fix and passed afterward.
- Seven real-change cases still reject publication (value, context, scope, key, timestamp, added and removed variables).
- Fresh full suite: 282 files / 1,293 tests passed, no failures or skips.
- Live read-only response comparison: raw order differed; canonical fingerprints matched.
- Independent focused review found no Critical/Important issues and independently checked extra fields, context parameters, duplicate preservation and nested-array ordering.

Final deployment and permission-restoration results will be recorded after the guarded publication attempt.
