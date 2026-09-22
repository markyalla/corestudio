-- AlterTable
ALTER TABLE "ClassType" ADD COLUMN     "defaultTrainerId" TEXT;

-- AddForeignKey
ALTER TABLE "ClassType" ADD CONSTRAINT "ClassType_defaultTrainerId_fkey" FOREIGN KEY ("defaultTrainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
