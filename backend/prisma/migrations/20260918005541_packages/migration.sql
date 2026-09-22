-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PACKAGE';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "memberPackageId" TEXT;

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classTypeId" TEXT NOT NULL,
    "sessionsGranted" INTEGER NOT NULL,
    "priceGHS" INTEGER NOT NULL,
    "validDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPackage" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "sessionsLeft" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberPackage_memberId_idx" ON "MemberPackage"("memberId");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPackage" ADD CONSTRAINT "MemberPackage_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPackage" ADD CONSTRAINT "MemberPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_memberPackageId_fkey" FOREIGN KEY ("memberPackageId") REFERENCES "MemberPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
