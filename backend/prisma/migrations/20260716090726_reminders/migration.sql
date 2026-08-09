-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "reminder24At" TIMESTAMP(3),
ADD COLUMN     "reminder2At" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "renewalReminderAt" TIMESTAMP(3);
