-- CreateTable
CREATE TABLE "_PackageClassTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PackageClassTypes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PackageClassTypes_B_index" ON "_PackageClassTypes"("B");

-- Backfill: carry each package's existing single classType into the new join table
INSERT INTO "_PackageClassTypes" ("A", "B")
SELECT "classTypeId", "id" FROM "Package";

-- AddForeignKey
ALTER TABLE "_PackageClassTypes" ADD CONSTRAINT "_PackageClassTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "ClassType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PackageClassTypes" ADD CONSTRAINT "_PackageClassTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_classTypeId_fkey";

-- DropColumn
ALTER TABLE "Package" DROP COLUMN "classTypeId";
