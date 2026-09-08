-- Preserve the existing instructor relationships while replacing the public identity.
UPDATE "User"
SET
  "name" = 'Nicole Finley',
  "email" = 'nicole-finley@rhyze.local',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "email" = 'jessica-blundetto@rhyze.local'
   OR LOWER(COALESCE("name", '')) = 'jessica blundetto';

UPDATE "InstructorProfile"
SET
  "bio" = E'Dance has been my absolute world for as long as I can remember. From the very first time I stepped onto the floor, movement became my language, my passion, and my constant. That lifelong love for dance shaped who I am and paved the way for an incredible journey.\n\nToday, my world is wonderfully full. Being a mom to my little girls is my greatest pride and joy, and watching them now take their very first steps on their own dance journeys is genuinely magical—it is like watching my own childhood come alive all over again through their eyes.\n\nTeaching allows me to bring everything I love full circle. Every single day in the studio, I get to share my lifelong passion, connect with amazing people, and inspire others to find their own rhythm. I am so grateful to live a life surrounded by family, dance, and community.',
  "photoUrl" = '/founders/instructor-nicole-finley.png',
  "isActive" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" IN (
  SELECT "id" FROM "User" WHERE "email" = 'nicole-finley@rhyze.local'
);

UPDATE "ClassTemplate"
SET
  "slug" = 'heels-101-walk-with-me-nicole',
  "name" = 'Heels 101 "Walk with Me" with Nicole',
  "description" = 'Step into your power and build unshakeable confidence with Heels 101: Walk with Me. Whether you are completely new to heels or looking to sharpen your technique, this class is all about mastering the foundation. We will focus on posture, balance, core strength, and the mechanics of a fierce, graceful stride so you can move with absolute poise and attitude. It is a safe, empowering space to leave your inhibitions at the door, connect with your inner strength, and own the room from the moment you step onto the floor. Bring your favorite heels, an open mind, and get ready to walk your walk!',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'heels-101-walk-with-me-jessica';

UPDATE "ClassTemplate"
SET
  "slug" = 'hypnotic-heels-nicole',
  "name" = 'Hypnotic Heels with Nicole',
  "description" = 'Hypnotic Heels with Nicole is a 75-minute specialty class for dancers ready to build confidence, poise, technique, and flow in heels. You will warm up, practice posture and balance, learn a choreographed routine, and explore a fresh monthly theme.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'hypnotic-heels-jessica';

UPDATE "ClassTemplate"
SET
  "slug" = 'hypnotic-heels-nicole-weekly-class',
  "name" = 'Hypnotic Heels with Nicole',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'hypnotic-heels-jessica-weekly-class';

UPDATE "ClassTemplate"
SET
  "isActive" = FALSE,
  "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'dance-fit-jessica';

-- ClassOccurrence foreign keys use ON UPDATE CASCADE, preserving bookings and attendance.
UPDATE "ClassOccurrence"
SET "id" = 'owned-event-hypnotic-heels-nicole'
WHERE "id" = 'owned-event-hypnotic-heels-jessica';

UPDATE "BookingTransfer"
SET "fromOccurrenceId" = 'owned-event-hypnotic-heels-nicole'
WHERE "fromOccurrenceId" = 'owned-event-hypnotic-heels-jessica';

UPDATE "BookingTransfer"
SET "toOccurrenceId" = 'owned-event-hypnotic-heels-nicole'
WHERE "toOccurrenceId" = 'owned-event-hypnotic-heels-jessica';
