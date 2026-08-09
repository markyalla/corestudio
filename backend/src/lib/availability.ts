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
