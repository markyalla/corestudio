import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_URL } from "./test-db-url";

export default async function globalSetup() {
  // Create the test database if missing (connect via the main dev database)
  const adminUrl = TEST_DATABASE_URL.replace(/\/[^/]+$/, "/corestudio");
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  const exists = await admin.$queryRaw<{ n: number }[]>`
    SELECT 1 AS n FROM pg_database WHERE datname = 'corestudio_test'`;
  if (exists.length === 0) {
    await admin.$executeRawUnsafe("CREATE DATABASE corestudio_test");
  }
  await admin.$disconnect();

  // Sync schema
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
