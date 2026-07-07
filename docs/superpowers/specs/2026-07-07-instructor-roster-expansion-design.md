# Instructor Roster Expansion Design

## Goal

Add Adrianna Jones, Julie Reese, Jessica Blundetto, Tricia Johnsen, and Carla Hotrock to the Instructors page immediately after Melissa Llanos, using the existing alternating photo-and-text card layout.

## Layout

The existing `InstructorCard` remains the shared presentation component. Cards continue alternating at the desktop breakpoint:

1. Vanessa Ramos: photo left
2. Melissa Llanos: photo right
3. Adrianna Jones: photo left
4. Julie Reese: photo right
5. Jessica Blundetto: photo left
6. Tricia Johnsen: photo right
7. Carla Hotrock: photo left

On smaller screens, every card stacks the photo above the text using the existing responsive layout.

## Data Model and Rendering

- Make `quote` optional because no quotes were provided for the five new instructors.
- Add an optional `descriptor` field for the second uppercase credential/specialty line supplied for Adrianna and Julie.
- Continue treating Instagram and email as optional; omit those controls for all five new instructors.
- Render the quote block only when a quote exists.
- Render the descriptor directly below the role without quotation marks.
- Change the shared image alt text from “co-founder” to “instructor at Rhyze Fitness” so it is accurate for the full roster.
- Preserve the existing specialty footer using concise specialties derived directly from the supplied headings.

## Instructor Data

### Adrianna Jones

- Slug: `adrianna-jones`
- Role: `RYT 500 (YOGA)`
- Descriptor: `VINYASA FLOW & FUNCTIONAL MOVEMENT`
- Photo: `/founders/instructor-adriana.jpg`
- Specialties: `Vinyasa Flow`, `Functional Movement`
- Bio:

> Adrianna teaches yoga for modern bodies. With more than seven years of teaching experience and a 500-hour Vinyasa certification, she combines traditional yoga practices with a deep understanding of strength, stability, mobility, and functional movement. Her approach emphasizes mindful movement, intelligent alignment, and developing strength throughout the body's full range of motion.
>
> Known for her focus on balance training, joint health, and the mind-muscle connection, Adrianna helps students build not only flexibility, but resilience, confidence, and trust in their bodies. She is passionate about making yoga accessible to everyone, from first-time students and active older adults to seasoned practitioners looking to deepen their practice. Her classes offer an inviting blend of challenge, curiosity, and self-discovery, encouraging students to move with intention and leave feeling stronger, more connected, and more capable than when they arrived.

### Julie Reese

- Slug: `julie-reese`
- Role: `HIIT INSTRUCTOR / PERSONAL TRAINER`
- Descriptor: `FUNCTIONAL FITNESS & CONDITIONING`
- Photo: `/founders/instructor-julie.jpg`
- Specialties: `HIIT`, `Functional Fitness`, `Conditioning`
- Bio:

> Julie is a NASM Certified Personal Trainer, Group Fitness Instructor, and Corrective Exercise Specialist dedicated to helping individuals build strength, confidence, and a healthier quality of life through functional fitness.
>
> Her athletic journey began in dance, training from age three through her twenties, before she transitioned into competitive boxing and CrossFit. With over a decade of experience as a full-time CrossFit coach, Julie brings a diverse skill set to every session. She holds additional certifications in kettlebell training, Olympic lifting, powerlifting, strongman, and boot camp instruction, allowing her to create dynamic programs tailored to all fitness levels.
>
> As a mother of two active boys, Julie understands the challenges of balancing fitness with everyday life. Her coaching combines accountability, education, and encouragement to build sustainable habits. Julie believes true fitness is about pushing beyond perceived limitations and finding the confidence to embrace challenges, while emphasizing self-compassion and recognizing that progress is not always linear. Whether you are a beginner or looking to elevate your performance, Julie is committed to guiding you through safe, effective, and empowering workouts.

### Jessica Blundetto

- Slug: `jessica-blundetto`
- Role: `DANCE FIT / HEELS`
- Photo: `/founders/instructor-jessica.jpg`
- Specialties: `Dance Fit`, `Heels`
- Bio:

> Hey, I’m Jess! I have over 30 years of dance experience, having trained and performed in a wide variety of styles, including ballet, hip-hop, modern, lyrical, ballroom, salsa, bachata, rumba, and cha-cha. My passion for movement and dance has led me to teach students of all ages, from children as young as 2½ years old to adults, helping each dancer build confidence, technique, and a lifelong love for movement.
>
> In addition to dance instruction, I am an experienced fitness instructor who loves creating fun, effective workouts that inspire individuals to stay active and reach their personal goals. My teaching style focuses on making fitness accessible, engaging, and enjoyable for every fitness level.

### Tricia Johnsen

- Slug: `tricia-johnsen`
- Role: `HIP-HOP HAPPY HOUR`
- Photo: `/founders/instructor-tricia.jpg`
- Specialties: `Hip-Hop`, `Dance Fitness`
- Bio:

> Tricia Johnsen is a dancer, choreographer, and fitness instructor with a background in TV, video, film, and the music industry. Her performance and choreography credits include work connected to music and entertainment projects such as Chris Brown’s “Run It,” Samantha Jade’s Step Up, and David Archuleta’s “Crush.”
>
> She is the founder of TCJ Dance Fitness, a brand she has run for over 10 years, offering high-energy, beginner-friendly dance fitness classes as well as specialized formats including heels and themed choreography sessions. In addition to group classes, Tricia also creates private dance party experiences, signature Hip Hop Half Hour sessions designed as fun, high-energy private events for groups.

### Carla Hotrock

- Slug: `carla-hotrock`
- Role: `CORE-WERK`
- Photo: `/founders/instructor-carla.jpg`
- Specialties: `Core-Werk`
- Bio:

> Carla is a passionate fitness professional with over 15 years of experience helping people become stronger, healthier, and more confident. Her classes are designed for all fitness levels, with a focus on building strength, improving endurance, and creating healthy habits that last a lifetime.
>
> Known for her motivating coaching style and positive energy, Carla believes fitness is about so much more than changing your body—it’s about building confidence, resilience, and a mindset that carries into every part of life. Whether you’re picking up a dumbbell for the first time or looking to challenge yourself, she’ll meet you where you are and help you reach your next level.
>
> Outside the gym, Carla is continuing her education in healthcare while inspiring others to live stronger, healthier lives. Her motto is simple: Strong body. Strong mind. Strong spirit.

## Images

Create web-ready copies in `public/founders/` from the five supplied Downloads files. Preserve each image’s aspect ratio, do not upscale smaller originals, strip unnecessary metadata, and encode JPEG output at high visual quality. Limit the longest dimension to 2000 pixels so Jessica’s source photo does not add unnecessary page weight.

## Page Copy

- Update metadata so the description refers to the complete Rhyze instructor team rather than only Vanessa and Melissa.
- Replace the founders-only introduction with: `Meet the instructors bringing dance, yoga, strength, and high-energy movement to the Rhyze floor.`
- Change the recruitment heading from `MORE COACHES COMING` to `JOIN THE RHYZE CREW` while retaining its teaching-contact action.

## Verification

- Confirm all seven instructors render in the required order.
- Confirm photo/text alternation on desktop and stacked cards on mobile.
- Confirm the five supplied biographies and headings render without invented quotes or contact links.
- Confirm all five image assets load and no “co-founder” alt text is applied to non-founders.
- Run TypeScript checking and a production build.
- Verify the local page in the browser at desktop and mobile widths with no console errors.
- Commit and push the implementation to `main`, then verify the automatic Netlify production deployment.
