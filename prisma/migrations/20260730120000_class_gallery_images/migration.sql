CREATE TABLE "ClassGalleryImage" (
  "id" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "altText" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassGalleryImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClassGalleryImage_isActive_position_idx"
ON "ClassGalleryImage"("isActive", "position");

INSERT INTO "ClassGalleryImage" ("id", "imageUrl", "altText", "position", "updatedAt") VALUES
  ('class-gallery-seed-09', '/classes-slideshow/slide-09.jpg', 'Rhyze Fitness class community photo 1', 0, CURRENT_TIMESTAMP),
  ('class-gallery-seed-11', '/classes-slideshow/slide-11.jpg', 'Rhyze Fitness class community photo 2', 1, CURRENT_TIMESTAMP),
  ('class-gallery-seed-13', '/classes-slideshow/slide-13.jpg', 'Rhyze Fitness class community photo 3', 2, CURRENT_TIMESTAMP),
  ('class-gallery-seed-16', '/classes-slideshow/slide-16.jpg', 'Rhyze Fitness class community photo 4', 3, CURRENT_TIMESTAMP),
  ('class-gallery-seed-01', '/classes-slideshow/slide-01.jpg', 'Rhyze Fitness class community photo 5', 4, CURRENT_TIMESTAMP),
  ('class-gallery-seed-02', '/classes-slideshow/slide-02.jpg', 'Rhyze Fitness class community photo 6', 5, CURRENT_TIMESTAMP),
  ('class-gallery-seed-04', '/classes-slideshow/slide-04.jpg', 'Rhyze Fitness class community photo 7', 6, CURRENT_TIMESTAMP),
  ('class-gallery-seed-07', '/classes-slideshow/slide-07.jpg', 'Rhyze Fitness class community photo 8', 7, CURRENT_TIMESTAMP),
  ('class-gallery-seed-17', '/classes-slideshow/slide-17.jpg', 'Rhyze Fitness class community photo 9', 8, CURRENT_TIMESTAMP),
  ('class-gallery-seed-10', '/classes-slideshow/slide-10.jpg', 'Rhyze Fitness class community photo 10', 9, CURRENT_TIMESTAMP),
  ('class-gallery-seed-15', '/classes-slideshow/slide-15.jpg', 'Rhyze Fitness class community photo 11', 10, CURRENT_TIMESTAMP),
  ('class-gallery-seed-05', '/classes-slideshow/slide-05.jpg', 'Rhyze Fitness class community photo 12', 11, CURRENT_TIMESTAMP),
  ('class-gallery-seed-06', '/classes-slideshow/slide-06.jpg', 'Rhyze Fitness class community photo 13', 12, CURRENT_TIMESTAMP),
  ('class-gallery-seed-14', '/classes-slideshow/slide-14.jpg', 'Rhyze Fitness class community photo 14', 13, CURRENT_TIMESTAMP),
  ('class-gallery-seed-03', '/classes-slideshow/slide-03.jpg', 'Rhyze Fitness class community photo 15', 14, CURRENT_TIMESTAMP),
  ('class-gallery-seed-08', '/classes-slideshow/slide-08.jpg', 'Rhyze Fitness class community photo 16', 15, CURRENT_TIMESTAMP),
  ('class-gallery-seed-12', '/classes-slideshow/slide-12.jpg', 'Rhyze Fitness class community photo 17', 16, CURRENT_TIMESTAMP);
