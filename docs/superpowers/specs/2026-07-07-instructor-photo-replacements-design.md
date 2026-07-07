# Instructor Photo Replacements Design

## Goal

Replace the existing website photos for Carla Hotrock, Jessica Blundetto, Julie Reese, and Tricia Johnsen with the four user-supplied JPEG files matched by instructor name.

## Approved Approach

Overwrite the existing canonical files in `public/founders/`:

| Source file | Website asset replaced | Instructor |
| --- | --- | --- |
| `/Users/gokuramos/Downloads/instructor-carla2.jpg` | `public/founders/instructor-carla.jpg` | Carla Hotrock |
| `/Users/gokuramos/Downloads/instructor-jessica2.jpg` | `public/founders/instructor-jessica.jpg` | Jessica Blundetto |
| `/Users/gokuramos/Downloads/instructor-julie2.jpg` | `public/founders/instructor-julie.jpg` | Julie Reese |
| `/Users/gokuramos/Downloads/instructor-tricia2.jpg` | `public/founders/instructor-tricia.jpg` | Tricia Johnsen |

The filenames and `lib/instructors.ts` photo paths remain unchanged. No layout, copy, instructor ordering, or other assets will change.

## Image Treatment

Use each supplied JPEG as provided. Do not crop, retouch, regenerate, or alter its aspect ratio. The existing instructor card continues to display images with `object-contain` inside its 4:5 image area.

## Verification

- Confirm the four destination files are byte-identical to their matching supplied files.
- Run the instructor tests, TypeScript type-check, and production build.
- Verify all four instructors show the new matching portraits on the local `/instructors/` page.
- Push the change to `main`, wait for the exact commit to publish on Netlify, and verify the live `/instructors/` page.

## Cache Risk

Because the public URLs remain unchanged, a browser or CDN may temporarily serve an older cached image. A hard refresh should retrieve the new files. If persistent caching occurs, a later cache-busting filename change would be required.
