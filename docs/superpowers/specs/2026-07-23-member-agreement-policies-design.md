# Member Agreement and Policies Design

## Goal

Give every member one readable, versioned digital agreement containing the studio waiver and all current policies, block booking until it is accepted, and preserve evidence of acceptance.

## Member dashboard

- Rename `Credits` to `Available Credits`.
- Keep the existing balance calculation and membership link unchanged.

## Agreement experience

- The member waiver page displays the complete current agreement in structured sections.
- Required acceptance uses one unchecked checkbox and an explicit `Accept and digitally sign` button.
- Acceptance stores waiver version, user ID, timestamp, available IP address, and user agent.
- A material agreement update creates a new active `WaiverVersion`; previous acceptances remain historical but no longer satisfy booking.
- Media consent is a separate optional checkbox. Declining it does not block booking.
- Members can print or save the agreement from the page.
- Members under 18 are told that a parent or guardian must sign in person.

## Policy coverage

The agreement contains:

- assumption of risk and release language;
- class transfers, late cancellations, and no-shows;
- refunds and membership cancellation rights;
- late booking;
- weather and emergency closures;
- private group parties;
- age requirements;
- health and safety;
- member conduct and removal for unsafe behavior;
- personal property;
- electronic records and policy updates;
- optional photography and media consent.

Weather rules cover both studio cancellations and approved individual travel-safety requests. Studio cancellations restore a credit or permit a fee-free transfer. Members may request a weather exception promptly; Rhyze retains reasonable discretion. A general State of Emergency is considered but is not automatically treated as a travel ban.

## Legal safeguard

The page includes a conspicuous note that statutory membership cancellation rights control over conflicting studio wording. The production agreement and membership contract require review by a New Jersey attorney before launch.

## Data and rendering

- `lib/policies.ts` is the single structured source for public policy rendering and the member agreement.
- The active `WaiverVersion.body` stores the same agreement snapshot for audit history.
- `WaiverAcceptance` gains `mediaConsent`, defaulting to false.
- Existing booking checks continue to require acceptance of the currently active waiver version.

## Testing

- Policy-source tests cover every required section and weather outcomes.
- Waiver tests confirm current-version acceptance and re-sign behavior.
- Action tests confirm required agreement acceptance and optional media consent.
- Existing public-policy regression tests remain green.

