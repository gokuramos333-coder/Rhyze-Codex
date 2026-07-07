# Rhyze Ritmo Content Update

## Goal

Rename the displayed class name from `Ritmo Rhyze` to `Rhyze Ritmo` everywhere it appears on the website and replace its class description with the user-provided copy.

## Scope

- Update the class catalog entry in `lib/classes.ts`.
- Update all matching schedule labels in `lib/schedule.ts`.
- Preserve the existing `ritmo-rhyze` slug and `/classes/ritmo-rhyze` URL so existing links remain valid.
- Do not change layout, styling, schedules, instructor assignments, or unrelated class content.

## Content

Name: `Rhyze Ritmo`

Description:

> Get ready to move! Rhyze Ritmo blends high-energy Latin rhythms with easy-to-follow dance fitness choreography. It’s a full-body cardio party designed to let you lose yourself in the music, torch calories, and leave feeling completely empowered. No dance experience required—just bring your energy!

## Verification

- Search active source files to confirm no displayed `Ritmo Rhyze` labels remain.
- Run the project typecheck.
- Verify the Classes page renders the new name and description while retaining the existing class URL.
