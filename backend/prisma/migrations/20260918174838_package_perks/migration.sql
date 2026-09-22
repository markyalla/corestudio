-- CreateTable
CREATE TABLE "_PackagePerks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PackagePerks_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PackagePerks_B_index" ON "_PackagePerks"("B");

-- AddForeignKey
ALTER TABLE "_PackagePerks" ADD CONSTRAINT "_PackagePerks_A_fkey" FOREIGN KEY ("A") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PackagePerks" ADD CONSTRAINT "_PackagePerks_B_fkey" FOREIGN KEY ("B") REFERENCES "PerkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
