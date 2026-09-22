/**
 * Installs the studio's weekly class timetable (S2, Airport, Cantonments) and
 * materialises the rolling session window. Use this on a production database;
 * `prisma db seed` runs the same thing for local dev.
 *
 * Idempotent: locations / trainers / class types are found-or-created; every
 * existing RecurrenceRule is wiped and rebuilt; future booking-free sessions
 * are cleared and regenerated. Past or booked sessions are kept.
 *
 * Run: npm run db:import-schedule  (from backend/)
 */
import { prisma } from "../src/lib/prisma";
import { generateSessions } from "../src/lib/cron-jobs";
import { STARTER_MOTIVATION } from "../src/lib/motivation";
import { applySchedule } from "../src/lib/schedule";

async function main() {
  // Which calendar month this timetable covers. Rules are scoped to it so they
  // don't bleed into the next month (the studio builds a new timetable monthly).
  // SCHEDULE_MONTH="YYYY-MM"; defaults to the current UTC month.
  const now = new Date();
  const monthArg = process.env.SCHEDULE_MONTH?.match(/^(\d{4})-(\d{2})$/);
  const year = monthArg ? Number(monthArg[1]) : now.getUTCFullYear();
  const month = monthArg ? Number(monthArg[2]) - 1 : now.getUTCMonth();
  const validFrom = new Date(Date.UTC(year, month, 1));
  const validUntil = new Date(Date.UTC(year, month + 1, 1));

  console.log(`Installing the weekly class timetable for ${validFrom.toISOString().slice(0, 7)}…`);

  const applied = await applySchedule(prisma, { validFrom, validUntil });
  const sessionsCreated = await generateSessions();

  let motivationSeeded = 0;
  if ((await prisma.motivationMessage.count()) === 0) {
    const res = await prisma.motivationMessage.createMany({
      data: STARTER_MOTIVATION.map((text) => ({ text })),
    });
    motivationSeeded = res.count;
  }

  console.log("Done:", {
    rulesWiped: applied.rulesWiped,
    sessionsWiped: applied.sessionsWiped,
    rulesCreated: applied.rulesCreated,
    sessionsCreated,
    motivationSeeded,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
