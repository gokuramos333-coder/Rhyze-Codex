UPDATE "InstructorProfile"
SET
  "bio" = $bio$Nicole Finley holds a Bachelor of Fine Arts in Dance from Montclair State University, where she received the Choreographic Excellence Award. A lifelong dancer with a competitive background, she has had the privilege of working with acclaimed choreographers such as Maxine Steinman, JT Jenkins, Urban Bush Women, and Karen Gayle. Nicole’s professional performance career took off in hip-hop, featuring in music videos for artists like Diggy Simmons, Maino, Swizz Beatz, Juelz Santana, and Jadakiss, as well as performing at major events across the East Coast.

With over 20 years of teaching experience across the tri-state area, Nicole educates dancers of all ages and styles, earning top score and choreography awards at both regional and national competitions. To keep growing as an educator, she regularly trains at Broadway Dance Center and Steps on Broadway and attends top teacher conventions. Nicole is dedicated to sharing her lifelong passion, technique, and creative energy with every student who walks into her class.$bio$,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "email" = 'nicole-finley@rhyze.local'
     OR LOWER(COALESCE("name", '')) = 'nicole finley'
);
