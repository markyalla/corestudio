-- Removes membership plans entirely — packages are now the only
-- prepaid/bundled way for a member to book. This is a destructive migration:
-- any member's remaining plan credits and renewal date are dropped, and
-- Payment rows lose their plan reference (the Payment rows themselves, and
-- Booking history, are left intact).

-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_planId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_planId_fkey";

-- DropForeignKey
ALTER TABLE "_PlanPerks" DROP CONSTRAINT "_PlanPerks_A_fkey";

-- DropForeignKey
ALTER TABLE "_PlanPerks" DROP CONSTRAINT "_PlanPerks_B_fkey";

-- DropTable
DROP TABLE "_PlanPerks";

-- DropTable
DROP TABLE "MembershipPlan";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "planId",
DROP COLUMN "creditsLeft",
DROP COLUMN "cycleRenewsAt",
DROP COLUMN "renewalReminderAt";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "planId";
