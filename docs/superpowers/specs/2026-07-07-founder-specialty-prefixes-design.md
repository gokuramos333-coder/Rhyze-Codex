# Founder Specialty Prefixes Design

## Goal

Add branded specialty prefixes to the existing Vanessa Ramos and Melissa Llanos instructor cards without changing layout or shared rendering.

## Changes

- Vanessa Ramos specialties: `['RHYZE UP', 'Dance', 'HIIT']`
- Melissa Llanos specialties: `['RITMO', 'Latin Dance', 'Choreography']`

The existing `InstructorCard` continues joining specialties with ` · `, producing:

- `RHYZE UP · Dance · HIIT`
- `RITMO · Latin Dance · Choreography`

## Scope

Modify only the two `specialties` arrays in `lib/instructors.ts`. Do not change component structure, styling, other instructors, or biographies.

## Verification

- Run the instructor contract test and TypeScript check.
- Verify both exact specialty strings on the local Instructors page.
- Push to `main` and verify the automatic Netlify production deployment.
