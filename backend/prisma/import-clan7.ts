/**
 * Installs Clan 7's private-session class types and one-time packages from
 * the pricing PDF. Idempotent — safe to re-run on production.
 *
 * Run: npm run db:import-clan7  (from backend/)
 */
import { prisma } from "../src/lib/prisma";
import { applyClan7 } from "../src/lib/clan7";

async function main() {
  console.log("Installing Clan 7 class types and packages…");
  const applied = await applyClan7(prisma);
  console.log("Done:", {
    classTypes: applied.classTypeIds.size,
    packagesCreated: applied.packagesCreated,
    packagesUpdated: applied.packagesUpdated,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
