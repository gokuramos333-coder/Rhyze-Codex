# ADMIN Client Directory Filters Design

## Goal

Make the ADMIN Clients directory easier to scan by numbering its visible rows, emphasizing membership names, identifying instructors, and supporting combined source/type and membership-plan filters.

## Behavior

- Number visible rows from 1 in the current filtered and sorted result set.
- Replace the Somble-status filter with a source/type filter containing All, Somble Transferred, Native Rhyze, and Instructors.
- Add an independent membership-plan filter containing All Membership Plans, every database product attached to a membership, and No native plan.
- Apply search, source/type, membership plan, and sort choices together through URL query parameters.
- Display an INSTRUCTOR status badge with a light-blue treatment for instructor accounts.
- Display real current membership plan names in Rhyze orange; retain neutral styling for No native plan.

## Data Rules

- Somble Transferred means the user has a `SombleClientProfile`.
- Native Rhyze means the user does not have a `SombleClientProfile`.
- Instructors means the user's role is `INSTRUCTOR`, regardless of source.
- Current memberships are `TRIALING`, `ACTIVE`, `PAST_DUE`, or `PAUSED`.
- No native plan means the user has no membership in a current status.

## Verification

- Unit-test the query construction for every filter branch and combined filters.
- Run type checking, all tests, and the production build.
- Do not deploy to Netlify.
