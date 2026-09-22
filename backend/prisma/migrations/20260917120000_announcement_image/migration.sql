-- Optional promo image for announcements/promotions, staff-uploaded from
-- Admin -> Settings, stored inline as a data: URL (base64).
ALTER TABLE "Announcement" ADD COLUMN "imageUrl" TEXT;
