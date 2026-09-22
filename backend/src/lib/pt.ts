// Helpers for private (one-on-one) class availability. Studio timezone is
// Africa/Accra (UTC+0), so "HH:mm" maps 1:1 onto UTC — same assumption the
// recurrence-rule generator makes (see lib/cron-jobs.ts).

import type { Prisma } from "@prisma/client";
import type { prisma } from "./prisma";
import { ApiError } from "./errors";

const DAY = 24 * 60 * 60 * 1000;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "HH:mm" → minutes since midnight (00:00 = 0). Assumes a validated string. */
export function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** minutes since midnight → "HH:mm". */
export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** UTC Date for a "YYYY-MM-DD" + "HH:mm" in studio local time. */
export function ptStartsAt(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00.000Z`);
}

export type BusyInterval = { start: number; end: number }; // minutes since midnight

/**
 * Subtracts busy intervals from [winStart, winEnd] and returns the free
 * sub-intervals that can still fit at least `minLen` minutes.
 */
export function freeRanges(
  winStart: number,
  winEnd: number,
  busy: BusyInterval[],
  minLen: number,
): { start: number; end: number }[] {
  const sorted = busy
    .filter((b) => b.end > winStart && b.start < winEnd)
    .sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let cursor = winStart;
  for (const b of sorted) {
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, winEnd) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= winEnd) break;
  }
  if (cursor < winEnd) out.push({ start: cursor, end: winEnd });
  return out.filter((r) => r.end - r.start >= minLen);
}

/** Half-open interval intersection: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Hard-blocks a private-class availability window (recurring weekday time
 * range) that would collide with a group class the trainer is assigned or
 * with another of the trainer's own windows on the same weekday.
 */
export async function assertPtWindowFree(
  db: Db,
  trainerId: string,
  win: { dayOfWeek: number; startMin: number; endMin: number; excludeWindowId?: string },
) {
  const dayName = DAY_NAMES[win.dayOfWeek] ?? "that day";

  const rules = await db.recurrenceRule.findMany({
    where: { trainerId, dayOfWeek: win.dayOfWeek, active: true },
    include: { classType: { select: { name: true, durationMins: true } } },
  });
  for (const r of rules) {
    const rStart = toMinutes(r.time);
    const rEnd = rStart + (r.classType?.durationMins ?? 60);
    if (overlaps(win.startMin, win.endMin, rStart, rEnd)) {
      throw new ApiError(
        409,
        `This window overlaps the ${r.classType?.name ?? "class"} you teach at ${r.time} on ${dayName}. Trim the window so it doesn't cover a class you're assigned.`,
      );
    }
  }

  const others = await db.ptWindow.findMany({
    where: {
      trainerId,
      dayOfWeek: win.dayOfWeek,
      active: true,
      ...(win.excludeWindowId ? { id: { not: win.excludeWindowId } } : {}),
    },
    select: { startTime: true, endTime: true },
  });
  for (const o of others) {
    if (overlaps(win.startMin, win.endMin, toMinutes(o.startTime), toMinutes(o.endTime))) {
      throw new ApiError(
        409,
        `You already have a private-class window on ${dayName} that overlaps this time.`,
      );
    }
  }
}

/** Inclusive list of "YYYY-MM-DD" strings from `from` through `from + days`. */
export function dateRange(from: Date, days: number): string[] {
  const start = new Date(from);
  start.setUTCHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let i = 0; i <= days; i++) {
    out.push(new Date(start.getTime() + i * DAY).toISOString().slice(0, 10));
  }
  return out;
}
