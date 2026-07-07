# Instructor Roster Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five supplied instructors and their photos below Melissa on the Instructors page while preserving the existing alternating responsive layout.

**Architecture:** `lib/instructors.ts` remains the roster source of truth, and `InstructorCard` remains the shared renderer. The data model gains optional `quote` and `descriptor` fields so supplied credentials can render accurately without invented content; the page continues deriving order and alternation from the array.

**Tech Stack:** Next.js 14, React 18, TypeScript, Next Image, Sharp, Node test runner

## Global Constraints

- Add instructors in this exact order after Melissa: Adrianna Jones, Julie Reese, Jessica Blundetto, Tricia Johnsen, Carla Hotrock.
- Preserve the existing alternating desktop layout and stacked mobile layout.
- Use the supplied biographies verbatim.
- Do not invent quotes, Instagram handles, or email addresses.
- Preserve image aspect ratios, do not upscale, strip metadata, use high-quality JPEG output, and limit the longest dimension to 2000 pixels.
- Keep changes scoped to instructor data, instructor rendering, instructor-page copy, supplied image assets, and focused verification.

---

### Task 1: Add a failing roster contract test

**Files:**
- Create: `tests/instructors.test.mjs`

**Interfaces:**
- Consumes: `instructors: Instructor[]` from `lib/instructors.ts` and files under `public/founders/`.
- Produces: A focused contract test for order, headings, optional quote behavior, and image existence.

- [ ] **Step 1: Create the roster contract test**

```ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { instructors } from '../lib/instructors.ts';

const expected = [
  ['vanessa-ramos', 'Vanessa', 'Ramos'],
  ['melissa-llanos', 'Melissa', 'Llanos'],
  ['adrianna-jones', 'Adrianna', 'Jones'],
  ['julie-reese', 'Julie', 'Reese'],
  ['jessica-blundetto', 'Jessica', 'Blundetto'],
  ['tricia-johnsen', 'Tricia', 'Johnsen'],
  ['carla-hotrock', 'Carla', 'Hotrock'],
];

test('instructor roster preserves the approved order', () => {
  assert.deepEqual(
    instructors.map(({ slug, firstName, lastName }) => [slug, firstName, lastName]),
    expected,
  );
});

test('new instructor headings match the approved copy', () => {
  const bySlug = Object.fromEntries(instructors.map((instructor) => [instructor.slug, instructor]));
  assert.equal(bySlug['adrianna-jones'].role, 'RYT 500 (YOGA)');
  assert.equal(bySlug['adrianna-jones'].descriptor, 'VINYASA FLOW & FUNCTIONAL MOVEMENT');
  assert.equal(bySlug['julie-reese'].role, 'HIIT INSTRUCTOR / PERSONAL TRAINER');
  assert.equal(bySlug['julie-reese'].descriptor, 'FUNCTIONAL FITNESS & CONDITIONING');
  assert.equal(bySlug['jessica-blundetto'].role, 'DANCE FIT / HEELS');
  assert.equal(bySlug['tricia-johnsen'].role, 'HIP-HOP HAPPY HOUR');
  assert.equal(bySlug['carla-hotrock'].role, 'CORE-WERK');
});

test('new instructors have no invented quote or contact data', () => {
  for (const instructor of instructors.slice(2)) {
    assert.equal(instructor.quote, undefined);
    assert.equal(instructor.instagram, undefined);
    assert.equal(instructor.email, undefined);
  }
});

test('new instructor image assets exist', () => {
  for (const instructor of instructors.slice(2)) {
    assert.equal(existsSync(`public${instructor.photo}`), true, instructor.photo);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/instructors.test.mjs`

Expected: FAIL because the five approved instructors and image files do not exist yet.

---

### Task 2: Prepare the five instructor images

**Files:**
- Create: `public/founders/instructor-adriana.jpg`
- Create: `public/founders/instructor-julie.jpg`
- Create: `public/founders/instructor-jessica.jpg`
- Create: `public/founders/instructor-tricia.jpg`
- Create: `public/founders/instructor-carla.jpg`

**Interfaces:**
- Consumes: The five user-supplied files in `/Users/gokuramos/Downloads/`.
- Produces: Web-ready JPEG files referenced by `Instructor.photo`.

- [ ] **Step 1: Generate web-ready assets with Sharp**

Run:

```js
const sharp = (await import('sharp')).default;
const images = [
  ['instructor-adriana.png', 'instructor-adriana.jpg'],
  ['instructor-julie.jpeg', 'instructor-julie.jpg'],
  ['instructor-jessica.jpeg', 'instructor-jessica.jpg'],
  ['instructor-tricia.jpg', 'instructor-tricia.jpg'],
  ['instructor-carla.jpg', 'instructor-carla.jpg'],
];
await Promise.all(
  images.map(([source, destination]) =>
    sharp(`/Users/gokuramos/Downloads/${source}`)
      .rotate()
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#000000' })
      .jpeg({ quality: 88, progressive: true })
      .toFile(`public/founders/${destination}`),
  ),
);
```

- [ ] **Step 2: Verify asset dimensions and sizes**

Run: `file public/founders/instructor-{adriana,julie,jessica,tricia,carla}.jpg && du -h public/founders/instructor-{adriana,julie,jessica,tricia,carla}.jpg`

Expected: Five valid JPEG files, none exceeding 2000 pixels on its longest dimension.

---

### Task 3: Extend instructor data and rendering

**Files:**
- Modify: `lib/instructors.ts`
- Modify: `components/sections/InstructorCard.tsx`
- Modify: `app/instructors/page.tsx`

**Interfaces:**
- Consumes: Existing `Instructor` and `InstructorCard` APIs plus the five image paths from Task 2.
- Produces: `Instructor` with `quote?: string` and `descriptor?: string`, seven ordered roster objects, conditional quote rendering, and updated page copy.

- [ ] **Step 1: Update the Instructor type**

Change `quote: string` to `quote?: string` and add `descriptor?: string` after `role`.

- [ ] **Step 2: Append the five approved instructor objects**

Append these objects after Melissa and omit `quote`, `instagram`, and `email`:

```ts
{
  slug: 'adrianna-jones',
  firstName: 'Adrianna',
  lastName: 'Jones',
  role: 'RYT 500 (YOGA)',
  descriptor: 'VINYASA FLOW & FUNCTIONAL MOVEMENT',
  photo: '/founders/instructor-adriana.jpg',
  bio: "Adrianna teaches yoga for modern bodies. With more than seven years of teaching experience and a 500-hour Vinyasa certification, she combines traditional yoga practices with a deep understanding of strength, stability, mobility, and functional movement. Her approach emphasizes mindful movement, intelligent alignment, and developing strength throughout the body's full range of motion.\n\nKnown for her focus on balance training, joint health, and the mind-muscle connection, Adrianna helps students build not only flexibility, but resilience, confidence, and trust in their bodies. She is passionate about making yoga accessible to everyone, from first-time students and active older adults to seasoned practitioners looking to deepen their practice. Her classes offer an inviting blend of challenge, curiosity, and self-discovery, encouraging students to move with intention and leave feeling stronger, more connected, and more capable than when they arrived.",
  specialties: ['Vinyasa Flow', 'Functional Movement'],
},
{
  slug: 'julie-reese',
  firstName: 'Julie',
  lastName: 'Reese',
  role: 'HIIT INSTRUCTOR / PERSONAL TRAINER',
  descriptor: 'FUNCTIONAL FITNESS & CONDITIONING',
  photo: '/founders/instructor-julie.jpg',
  bio: 'Julie is a NASM Certified Personal Trainer, Group Fitness Instructor, and Corrective Exercise Specialist dedicated to helping individuals build strength, confidence, and a healthier quality of life through functional fitness.\n\nHer athletic journey began in dance, training from age three through her twenties, before she transitioned into competitive boxing and CrossFit. With over a decade of experience as a full-time CrossFit coach, Julie brings a diverse skill set to every session. She holds additional certifications in kettlebell training, Olympic lifting, powerlifting, strongman, and boot camp instruction, allowing her to create dynamic programs tailored to all fitness levels.\n\nAs a mother of two active boys, Julie understands the challenges of balancing fitness with everyday life. Her coaching combines accountability, education, and encouragement to build sustainable habits. Julie believes true fitness is about pushing beyond perceived limitations and finding the confidence to embrace challenges, while emphasizing self-compassion and recognizing that progress is not always linear. Whether you are a beginner or looking to elevate your performance, Julie is committed to guiding you through safe, effective, and empowering workouts.',
  specialties: ['HIIT', 'Functional Fitness', 'Conditioning'],
},
{
  slug: 'jessica-blundetto',
  firstName: 'Jessica',
  lastName: 'Blundetto',
  role: 'DANCE FIT / HEELS',
  photo: '/founders/instructor-jessica.jpg',
  bio: 'Hey, I’m Jess! I have over 30 years of dance experience, having trained and performed in a wide variety of styles, including ballet, hip-hop, modern, lyrical, ballroom, salsa, bachata, rumba, and cha-cha. My passion for movement and dance has led me to teach students of all ages, from children as young as 2½ years old to adults, helping each dancer build confidence, technique, and a lifelong love for movement.\n\nIn addition to dance instruction, I am an experienced fitness instructor who loves creating fun, effective workouts that inspire individuals to stay active and reach their personal goals. My teaching style focuses on making fitness accessible, engaging, and enjoyable for every fitness level.',
  specialties: ['Dance Fit', 'Heels'],
},
{
  slug: 'tricia-johnsen',
  firstName: 'Tricia',
  lastName: 'Johnsen',
  role: 'HIP-HOP HAPPY HOUR',
  photo: '/founders/instructor-tricia.jpg',
  bio: 'Tricia Johnsen is a dancer, choreographer, and fitness instructor with a background in TV, video, film, and the music industry. Her performance and choreography credits include work connected to music and entertainment projects such as Chris Brown’s “Run It,” Samantha Jade’s Step Up, and David Archuleta’s “Crush.”\n\nShe is the founder of TCJ Dance Fitness, a brand she has run for over 10 years, offering high-energy, beginner-friendly dance fitness classes as well as specialized formats including heels and themed choreography sessions. In addition to group classes, Tricia also creates private dance party experiences, signature Hip Hop Half Hour sessions designed as fun, high-energy private events for groups.',
  specialties: ['Hip-Hop', 'Dance Fitness'],
},
{
  slug: 'carla-hotrock',
  firstName: 'Carla',
  lastName: 'Hotrock',
  role: 'CORE-WERK',
  photo: '/founders/instructor-carla.jpg',
  bio: 'Carla is a passionate fitness professional with over 15 years of experience helping people become stronger, healthier, and more confident. Her classes are designed for all fitness levels, with a focus on building strength, improving endurance, and creating healthy habits that last a lifetime.\n\nKnown for her motivating coaching style and positive energy, Carla believes fitness is about so much more than changing your body—it’s about building confidence, resilience, and a mindset that carries into every part of life. Whether you’re picking up a dumbbell for the first time or looking to challenge yourself, she’ll meet you where you are and help you reach your next level.\n\nOutside the gym, Carla is continuing her education in healthcare while inspiring others to live stronger, healthier lives. Her motto is simple: Strong body. Strong mind. Strong spirit.',
  specialties: ['Core-Werk'],
},
```

- [ ] **Step 3: Render optional descriptor and quote fields**

In `InstructorCard`, render `descriptor` beneath `role` as uppercase gold supporting text when present. Wrap the existing blockquote in `i.quote && (...)` so new cards do not show empty quotation marks. Change image alt text to ``${i.firstName} ${i.lastName}, instructor at Rhyze Fitness``.

- [ ] **Step 4: Update page-level copy**

Set metadata description to `Meet the dance, yoga, strength, and fitness instructors of Rhyze Fitness in Lafayette, NJ.` Set the intro paragraph to `Meet the instructors bringing dance, yoga, strength, and high-energy movement to the Rhyze floor.` Change `MORE COACHES COMING` to `JOIN THE RHYZE CREW`.

- [ ] **Step 5: Run the contract test and typecheck**

Run: `node --test tests/instructors.test.mjs && npm run typecheck`

Expected: Four tests pass and TypeScript exits with code 0.

---

### Task 4: Verify, commit, and deploy

**Files:**
- Verify: `app/instructors/page.tsx`
- Commit: all files created or modified by Tasks 1–3 plus this plan

**Interfaces:**
- Consumes: The completed local implementation and existing GitHub→Netlify pipeline.
- Produces: A verified production deployment from `main`.

- [ ] **Step 1: Run production verification**

Run: `node --test tests/instructors.test.mjs && npm run typecheck && npm run build`

Expected: Four tests pass, TypeScript passes, and the Next.js production build exits with code 0.

- [ ] **Step 2: Verify desktop rendering**

Run the local site and inspect `/instructors/` at 1280×720. Confirm seven cards, approved order, alternating photo placement, supplied headings and biographies, five loaded images, and no console errors.

- [ ] **Step 3: Verify mobile rendering**

Inspect `/instructors/` at a 390×844 viewport. Confirm every card stacks photo above text, content remains readable, and there is no horizontal overflow.

- [ ] **Step 4: Commit and push**

```bash
git add tests/instructors.test.mjs lib/instructors.ts components/sections/InstructorCard.tsx app/instructors/page.tsx public/founders/instructor-*.jpg docs/superpowers/plans/2026-07-07-instructor-roster-expansion.md
git commit -m "feat: add expanded instructor roster"
git push
```

- [ ] **Step 5: Verify Netlify production**

Confirm Netlify publishes the pushed commit, then inspect `https://rhyzefitpreview.netlify.app/instructors/` for all seven instructors and no browser errors.
