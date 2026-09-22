-- CreateEnum
CREATE TYPE "TrainerRequestType" AS ENUM ('CANCEL_SESSION', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TrainerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelReason" TEXT;

-- CreateTable
CREATE TABLE "TrainerRequest" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "TrainerRequestType" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TrainerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "TrainerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerRequest_trainerId_idx" ON "TrainerRequest"("trainerId");

-- CreateIndex
CREATE INDEX "TrainerRequest_status_idx" ON "TrainerRequest"("status");

-- AddForeignKey
ALTER TABLE "TrainerRequest" ADD CONSTRAINT "TrainerRequest_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerRequest" ADD CONSTRAINT "TrainerRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
