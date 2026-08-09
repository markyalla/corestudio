-- Feature: class Locations
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Session" ADD COLUMN "locationId" TEXT;
ALTER TABLE "RecurrenceRule" ADD COLUMN "locationId" TEXT;

ALTER TABLE "Session" ADD CONSTRAINT "Session_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Feature: trainer availability / blackout dates
CREATE TABLE "TrainerUnavailability" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerUnavailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainerUnavailability_trainerId_date_key" ON "TrainerUnavailability"("trainerId", "date");
CREATE INDEX "TrainerUnavailability_trainerId_date_idx" ON "TrainerUnavailability"("trainerId", "date");

ALTER TABLE "TrainerUnavailability" ADD CONSTRAINT "TrainerUnavailability_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Feature: classes + bonus credits (replaces the single creditsPerCycle field,
-- 999 = unlimited sentinel is retired) and a reusable plan-perks catalog.
ALTER TABLE "MembershipPlan" ADD COLUMN "classesPerCycle" INTEGER;
ALTER TABLE "MembershipPlan" ADD COLUMN "bonusCredits" INTEGER NOT NULL DEFAULT 0;

-- Backfill: the old 999 sentinel ("unlimited") becomes 6 classes + 1 bonus
-- (the studio owner's own worked example); other finite plans keep their
-- existing number as classesPerCycle with bonusCredits=0 — an admin can
-- raise bonusCredits per-plan afterward via the settings UI.
UPDATE "MembershipPlan"
SET "classesPerCycle" = CASE WHEN "creditsPerCycle" >= 999 THEN 6 ELSE "creditsPerCycle" END,
    "bonusCredits"    = CASE WHEN "creditsPerCycle" >= 999 THEN 1 ELSE 0 END;

ALTER TABLE "MembershipPlan" ALTER COLUMN "classesPerCycle" SET NOT NULL;
ALTER TABLE "MembershipPlan" DROP COLUMN "creditsPerCycle";

CREATE TABLE "PerkItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PerkItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_PlanPerks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PlanPerks_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_PlanPerks_B_index" ON "_PlanPerks"("B");

ALTER TABLE "_PlanPerks" ADD CONSTRAINT "_PlanPerks_A_fkey" FOREIGN KEY ("A") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PlanPerks" ADD CONSTRAINT "_PlanPerks_B_fkey" FOREIGN KEY ("B") REFERENCES "PerkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
