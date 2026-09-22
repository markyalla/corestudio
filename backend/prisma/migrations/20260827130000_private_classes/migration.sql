-- Feature: private (one-on-one) classes.
-- Trainers get a separate, usually higher commission rate for private-class
-- bookings, and define recurring weekly availability windows members book into.
ALTER TABLE "Trainer" ADD COLUMN "ptCommissionPercent" INTEGER NOT NULL DEFAULT 60;

CREATE TABLE "PtWindow" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 60,
    "priceGHS" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PtWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PtWindow_trainerId_dayOfWeek_idx" ON "PtWindow"("trainerId", "dayOfWeek");

ALTER TABLE "PtWindow" ADD CONSTRAINT "PtWindow_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PtWindow" ADD CONSTRAINT "PtWindow_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payout statements split the private-class portion so a rate change doesn't
-- distort past statements.
ALTER TABLE "Payout" ADD COLUMN "ptGrossGHS" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payout" ADD COLUMN "ptCommissionPercent" INTEGER NOT NULL DEFAULT 0;
