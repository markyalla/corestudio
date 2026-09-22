-- Feature: per-member studio location preference.
-- Members must pick a location before subscribing to a plan; it also filters
-- the sessions shown to them in the app.
ALTER TABLE "Member" ADD COLUMN "preferredLocationId" TEXT;

ALTER TABLE "Member" ADD CONSTRAINT "Member_preferredLocationId_fkey" FOREIGN KEY ("preferredLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Feature: Home-screen announcements & promotions, posted by staff from
-- Admin → Settings.
CREATE TYPE "AnnouncementKind" AS ENUM ('ANNOUNCEMENT', 'PROMOTION');

CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "kind" "AnnouncementKind" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_active_idx" ON "Announcement"("active");
