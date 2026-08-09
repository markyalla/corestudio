import { TEST_DATABASE_URL } from "./test-db-url";

// Must run before any module imports @/lib/prisma
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AUTH_URL = "http://localhost:3000";
process.env.SMS_PROVIDER = "console";
