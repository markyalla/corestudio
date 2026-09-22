-- Feature: daily motivation messages shown on the app Home screen. Staff
-- curate the pool from Admin → Settings; the app rotates through the active
-- rows one per calendar day.
CREATE TABLE "MotivationMessage" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MotivationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MotivationMessage_active_idx" ON "MotivationMessage"("active");
