# Instructor Photo Replacements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Carla Hotrock, Jessica Blundetto, Julie Reese, and Tricia Johnsen's existing website portraits with the four approved supplied JPEGs.

**Architecture:** Overwrite the four canonical files under `public/founders/` so the existing instructor data and component remain unchanged. Protect the exact name-to-photo mapping with SHA-256 assertions in the instructor test suite.

**Tech Stack:** Next.js 14, TypeScript, Node.js test runner, JPEG assets

## Global Constraints

- Keep all existing public image URLs unchanged.
- Use each supplied JPEG byte-for-byte without cropping, retouching, regeneration, or aspect-ratio changes.
- Do not change instructor copy, ordering, layout, or unrelated assets.
- Retain the existing `object-contain` image treatment inside the 4:5 card area.

---

### Task 1: Replace Four Instructor Portraits

**Files:**
- Modify: `tests/instructors.test.mjs`
- Replace: `public/founders/instructor-carla.jpg`
- Replace: `public/founders/instructor-jessica.jpg`
- Replace: `public/founders/instructor-julie.jpg`
- Replace: `public/founders/instructor-tricia.jpg`

**Interfaces:**
- Consumes: Existing `Instructor.photo` URLs and the four supplied files under `/Users/gokuramos/Downloads/`.
- Produces: The same four public URLs serving the approved replacement bytes.

- [ ] **Step 1: Write the failing hash test**

Update the imports in `tests/instructors.test.mjs`:

```js
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
```

Add this test:

```js
test('replacement instructor photos match the approved files', () => {
  const expectedHashes = {
    '/founders/instructor-carla.jpg':
      '91792ec220824b16a4f6739ef6c044431a8765cc5ae2d45389fdab8284fb7cb6',
    '/founders/instructor-jessica.jpg':
      'afa21cc9716154eb333c063e84e3b0c76f725531111dee704e1ccac5abc8e4c8',
    '/founders/instructor-julie.jpg':
      '1615a6efe0c7355f818fb76951354267b296262fa531fd0088a72593f8d27596',
    '/founders/instructor-tricia.jpg':
      '9c8285d5a9355888b47ff54a6a6cb3dd36c619757ec53dd0a6debfda638f369b',
  };

  for (const [photo, expectedHash] of Object.entries(expectedHashes)) {
    const actualHash = createHash('sha256')
      .update(readFileSync(`public${photo}`))
      .digest('hex');

    assert.equal(actualHash, expectedHash, photo);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/instructors.test.mjs`

Expected: FAIL because the four current public files have different SHA-256 hashes.

- [ ] **Step 3: Overwrite the four canonical assets**

Run:

```bash
cp /Users/gokuramos/Downloads/instructor-carla2.jpg public/founders/instructor-carla.jpg
cp /Users/gokuramos/Downloads/instructor-jessica2.jpg public/founders/instructor-jessica.jpg
cp /Users/gokuramos/Downloads/instructor-julie2.jpg public/founders/instructor-julie.jpg
cp /Users/gokuramos/Downloads/instructor-tricia2.jpg public/founders/instructor-tricia.jpg
```

- [ ] **Step 4: Verify tests, types, build, and local rendering**

Run:

```bash
node --no-warnings --test tests/instructors.test.mjs
npm run typecheck
npm run build
```

Expected: all six instructor tests pass; type checking and the production build exit successfully. On `/instructors/`, visually confirm each new portrait is paired with Carla, Jessica, Julie, or Tricia and no image is broken.

- [ ] **Step 5: Commit and deploy**

```bash
git add docs/superpowers/plans/2026-07-07-instructor-photo-replacements.md tests/instructors.test.mjs public/founders/instructor-carla.jpg public/founders/instructor-jessica.jpg public/founders/instructor-julie.jpg public/founders/instructor-tricia.jpg
git commit -m "content: replace instructor portraits"
git push origin main
```

Expected: Netlify publishes the exact new `main` commit. Verify the live `/instructors/` page after a hard refresh because the image URLs are unchanged.
