/**
 * Bootstraps the first OWNER account on a fresh production database.
 * Never run `db:seed` against production — it hardcodes `password123` for
 * every seeded account. This script creates exactly one real OWNER user.
 *
 * Also creates the singleton Studio row if one doesn't exist yet, since
 * every admin page assumes `prisma.studio.findFirstOrThrow()` succeeds.
 *
 * Run: OWNER_NAME=... OWNER_EMAIL=... OWNER_PHONE=... OWNER_PASSWORD=... \
 *   npm run db:create-owner --workspace=backend
 * (or `docker compose exec backend` with the same env vars set)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.OWNER_NAME;
  const email = process.env.OWNER_EMAIL;
  const phone = process.env.OWNER_PHONE;
  const password = process.env.OWNER_PASSWORD;

  if (!name || !email || !password) {
    console.error(
      "Usage: OWNER_NAME=... OWNER_EMAIL=... OWNER_PASSWORD=... [OWNER_PHONE=...] npm run db:create-owner --workspace=backend",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("OWNER_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.error(`A user with email ${email} already exists (role: ${existing.role}) — refusing to overwrite.`);
    process.exit(1);
  }

  const studio = await prisma.studio.findFirst();
  if (!studio) {
    await prisma.studio.create({ data: { name: "CoreStudio" } });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      phone: phone ?? null,
      passwordHash: await bcrypt.hash(password, 10),
      role: "OWNER",
    },
  });

  console.log(`Created OWNER account: ${user.email} (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
