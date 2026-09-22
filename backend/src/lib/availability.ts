import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./errors";

const DAY = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 90;

function toUtcMidnight(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/** Expands a `{ dates }` or `{ startDate, endDate }` request shape into a
 *  deduped, sorted list of UTC-midnight dates. Throws on an empty/invalid
 *  range or a span over MAX_RANGE_DAYS. */
export function expandDates(input: { dates?: string[] } | { startDate: string; endDate: string }): Date[] {
  const out = new Set<number>();
  if ("dates" in input && input.dates) {
    for (const d of input.dates) out.add(toUtcMidnight(new Date(d)).getTime());
  } else if ("startDate" in input) {
    const start = toUtcMidnight(new Date(input.startDate));
    const end = toUtcMidnight(new Date(input.endDate));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new ApiError(400, "Invalid date range");
    }
    const spanDays = Math.round((end.getTime() - start.getTime()) / DAY);
    if (spanDays > MAX_RANGE_DAYS) throw new ApiError(400, `Range too long (max ${MAX_RANGE_DAYS} days)`);
    for (let t = start.getTime(); t <= end.getTime(); t += DAY) out.add(t);
  }
  if (out.size === 0) throw new ApiError(400, "No dates given");
  return [...out].sort().map((t) => new Date(t));
}

/** Throws a 409 if the trainer is marked unavailable on any of the given
 *  dates — the hard-block enforcement point for session creation/generation. */
export async function assertTrainerAvailable(
  tx: Prisma.TransactionClient | typeof prisma,
  trainerId: string,
  dates: Date[],
) {
  const blocked = await tx.trainerUnavailability.findMany({
    where: { trainerId, date: { in: dates.map(toUtcMidnight) } },
  });
  if (blocked.length > 0) {
    const first = blocked[0].date.toISOString().slice(0, 10);
    throw new ApiError(409, `Trainer is marked unavailable on ${first}`);
  }
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Serialises concurrent private-class bookings for one trainer (mirrors
 *  lockSession in booking.ts). */
export async function lockTrainer(tx: Prisma.TransactionClient, trainerId: string) {
  await tx.$queryRaw`SELECT id FROM "Trainer" WHERE id = ${trainerId} FOR UPDATE`;
}

export type TrainerSessionClash = {
  startsAt: Date;
  kind: "CLASS" | "PT";
  className: string | null;
};

/** Returns the first SCHEDULED session assigned to the trainer whose time
 *  intersects [startsAt, startsAt+durationMins), or null. */
export async function findTrainerSessionClash(
  db: Db,
  trainerId: string,
  startsAt: Date,
  durationMins: number,
  excludeSessionId?: string,
): Promise<TrainerSessionClash | null> {
  const end = new Date(startsAt.getTime() + durationMins * 60_000);
  const rows = await db.session.findMany({
    where: {
      trainerId,
      status: "SCHEDULED",
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      startsAt: {
        gte: new Date(startsAt.getTime() - DAY),
        lt: new Date(end.getTime() + DAY),
      },
    },
    select: { startsAt: true, durationMins: true, kind: true, classType: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
  for (const s of rows) {
    const sEnd = new Date(s.startsAt.getTime() + s.durationMins * 60_000);
    if (s.startsAt < end && startsAt < sEnd) {
      return { startsAt: s.startsAt, kind: s.kind, className: s.classType?.name ?? null };
    }
  }
  return null;
}

/** Throws a 409 if [startsAt, startsAt+durationMins) intersects any other
 *  SCHEDULED session assigned to the trainer — used both when a member books a
 *  private slot and when staff create/move a session onto that trainer. */
export async function assertNoTrainerSessionOverlap(
  db: Db,
  trainerId: string,
  startsAt: Date,
  durationMins: number,
  excludeSessionId?: string,
) {
  const clash = await findTrainerSessionClash(db, trainerId, startsAt, durationMins, excludeSessionId);
  if (clash) {
    const when = clash.startsAt.toISOString().slice(0, 16).replace("T", " ");
    throw new ApiError(409, `Overlaps another session for this trainer at ${when}`);
  }
}
