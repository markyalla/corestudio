import { prisma } from "./prisma";
import { ApiError } from "./errors";

const DAY = 24 * 60 * 60 * 1000;

export type ProgressTier =
  | "GETTING_STARTED"
  | "THRIVING"
  | "ON_TRACK"
  | "SLIPPING"
  | "INACTIVE";

export interface ProgressStats {
  attendedTotal: number;
  attendedThisMonth: number;
  streakWeeks: number;
  attendanceRate: number | null; // 0..1 over the recent window, null if no data
  perWeek: number; // avg attended / week over the recent window
  upcoming: number;
  creditsLeft: number;
  daysToRenewal: number | null;
}

export interface Progress {
  stats: ProgressStats;
  tier: ProgressTier;
  headline: string;
  message: string;
  tips: string[];
}

/** UTC ISO-week key ("2026-W36") for grouping attendance into weeks. */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day); // nearest Thursday
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Consecutive weeks (ending this week or last week) with >= 1 attended class. */
function attendanceStreak(attendedDates: Date[], now: Date): number {
  if (attendedDates.length === 0) return 0;
  const weeks = new Set(attendedDates.map(isoWeekKey));
  let cursor = new Date(now);
  // Allow the current week to be empty so far without breaking the streak.
  if (!weeks.has(isoWeekKey(cursor))) cursor = new Date(cursor.getTime() - 7 * DAY);
  let streak = 0;
  while (weeks.has(isoWeekKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 7 * DAY);
  }
  return streak;
}

function tierCopy(tier: ProgressTier, s: ProgressStats): { headline: string; message: string; tips: string[] } {
  switch (tier) {
    case "THRIVING":
      return {
        headline: "You're on a roll 🔥",
        message: `${s.attendedTotal} classes in the bank and a ${s.streakWeeks}-week streak. This is exactly how it's done — keep showing up.`,
        tips: [
          s.upcoming === 0 ? "Lock in your next class now to protect the streak." : "Next class is booked — nice.",
          s.daysToRenewal !== null && s.daysToRenewal <= 5 ? "Your plan renews soon — renew early so you don't lose momentum." : "Aim to keep 2+ classes a week.",
        ],
      };
    case "ON_TRACK":
      return {
        headline: "Nice and steady",
        message: `You're averaging ${s.perWeek.toFixed(1)} classes a week and turning up for the ones you book. Keep it going.`,
        tips: [
          s.upcoming === 0 ? "Book your next class while you're thinking about it." : "You've got a class coming up — see you there.",
          "Try adding one more class this week to build a streak.",
        ],
      };
    case "SLIPPING":
      return {
        headline: "Let's get back to it",
        message:
          s.attendanceRate !== null && s.attendanceRate < 0.7
            ? "You've missed a few classes you booked lately. Remember a no-show still uses a credit — cancel early if plans change."
            : "It's been a quiet couple of weeks. One class this week is all it takes to reset the habit.",
        tips: [
          "Book a class you know you can make — morning slots are easiest to keep.",
          s.creditsLeft > 0 ? `You still have ${s.creditsLeft} class${s.creditsLeft === 1 ? "" : "es"} on your plan — use them before they cycle.` : "Top up your plan and pick a time that fits your week.",
        ],
      };
    case "INACTIVE":
      return {
        headline: "We've missed you",
        message: "It's been over a month since your last class. Your spot is still here whenever you're ready — start small.",
        tips: [
          s.creditsLeft > 0 ? `You have ${s.creditsLeft} unused class${s.creditsLeft === 1 ? "" : "es"} waiting.` : "Grab a single class to ease back in — no plan needed.",
          "Book something gentle for later this week and just show up.",
        ],
      };
    default: // GETTING_STARTED
      return {
        headline: "Welcome — let's build the habit",
        message:
          s.attendedTotal === 0
            ? "Your first class is the biggest one. Pick a time this week and get it on the calendar."
            : `${s.attendedTotal} down. The habit sticks around class 3 or 4 — keep going.`,
        tips: [
          s.upcoming === 0 ? "Book your next class from the Classes tab." : "Your next class is booked — you're on your way.",
          "Same day and time each week is the easiest routine to keep.",
        ],
      };
  }
}

export async function computeProgress(memberId: string): Promise<Progress> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new ApiError(404, "Member not found");

  const bookings = await prisma.booking.findMany({
    where: { memberId },
    select: { status: true, session: { select: { startsAt: true } } },
  });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const recentStart = new Date(now.getTime() - 56 * DAY);
  const thirtyAgo = new Date(now.getTime() - 30 * DAY);

  const attendedDates: Date[] = [];
  let attendedTotal = 0;
  let attendedThisMonth = 0;
  let recentAttended = 0;
  let recentNoShow = 0;
  let upcoming = 0;
  let lastAttended: Date | null = null;

  for (const b of bookings) {
    const when = b.session.startsAt;
    if (b.status === "ATTENDED") {
      attendedTotal++;
      attendedDates.push(when);
      if (when >= monthStart) attendedThisMonth++;
      if (when >= recentStart) recentAttended++;
      if (!lastAttended || when > lastAttended) lastAttended = when;
    } else if (b.status === "NO_SHOW") {
      if (when >= recentStart) recentNoShow++;
    } else if (b.status === "BOOKED" && when > now) {
      upcoming++;
    }
  }

  const attendanceRate =
    recentAttended + recentNoShow > 0 ? recentAttended / (recentAttended + recentNoShow) : null;
  const perWeek = recentAttended / 8;
  const streakWeeks = attendanceStreak(attendedDates, now);
  const daysToRenewal = member.cycleRenewsAt
    ? Math.max(0, Math.ceil((member.cycleRenewsAt.getTime() - now.getTime()) / DAY))
    : null;

  const stats: ProgressStats = {
    attendedTotal,
    attendedThisMonth,
    streakWeeks,
    attendanceRate,
    perWeek,
    upcoming,
    creditsLeft: member.creditsLeft,
    daysToRenewal,
  };

  let tier: ProgressTier;
  if (attendedTotal < 3) {
    tier = "GETTING_STARTED";
  } else if (!lastAttended || lastAttended < thirtyAgo) {
    tier = "INACTIVE";
  } else if (perWeek >= 2 && (attendanceRate ?? 0) >= 0.9 && streakWeeks >= 3) {
    tier = "THRIVING";
  } else if (perWeek >= 1 && (attendanceRate ?? 1) >= 0.7) {
    tier = "ON_TRACK";
  } else {
    tier = "SLIPPING";
  }

  return { stats, tier, ...tierCopy(tier, stats) };
}
