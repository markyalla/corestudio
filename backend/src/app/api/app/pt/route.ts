import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { dateRange, freeRanges, fromMinutes, toMinutes, type BusyInterval } from "@/lib/pt";

const STEP_MINS = 15;

/** Private-class offerings for the app: one entry per trainer with active
 *  availability windows, each with the concrete days + open time ranges a
 *  member can book into. */
export const GET = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const studio = await prisma.studio.findFirstOrThrow();
  const member = await prisma.member.findFirst({ where: { userId: auth.user.id } });
  if (!member) throw new ApiError(404, "No member profile for this account");

  const windows = await prisma.ptWindow.findMany({
    where: {
      active: true,
      ...(member.preferredLocationId ? { locationId: member.preferredLocationId } : {}),
      location: { active: true },
    },
    include: {
      location: { select: { id: true, name: true } },
      trainer: { include: { user: { select: { name: true } } } },
    },
  });
  if (windows.length === 0) return NextResponse.json({ offerings: [] });

  const now = new Date();
  const cutoffMin = studio.bookingCutoffMinutes;
  const dates = dateRange(now, studio.advanceBookingDays);
  const todayStr = now.toISOString().slice(0, 10);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const trainerIds = [...new Set(windows.map((w) => w.trainerId))];

  const rangeStart = new Date(dates[0] + "T00:00:00.000Z");
  const rangeEnd = new Date(dates[dates.length - 1] + "T23:59:59.999Z");
  const [sessions, unavailable] = await Promise.all([
    prisma.session.findMany({
      where: {
        trainerId: { in: trainerIds },
        status: "SCHEDULED",
        startsAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { trainerId: true, startsAt: true, durationMins: true },
    }),
    prisma.trainerUnavailability.findMany({
      where: { trainerId: { in: trainerIds }, date: { gte: rangeStart, lte: rangeEnd } },
      select: { trainerId: true, date: true },
    }),
  ]);

  const busyByTrainerDay = new Map<string, BusyInterval[]>();
  for (const s of sessions) {
    const day = s.startsAt.toISOString().slice(0, 10);
    const startMin = s.startsAt.getUTCHours() * 60 + s.startsAt.getUTCMinutes();
    const key = `${s.trainerId}|${day}`;
    const list = busyByTrainerDay.get(key) ?? [];
    list.push({ start: startMin, end: startMin + s.durationMins });
    busyByTrainerDay.set(key, list);
  }
  const blockedDays = new Set(
    unavailable.map((u) => `${u.trainerId}|${u.date.toISOString().slice(0, 10)}`),
  );

  const byTrainer = new Map<string, typeof windows>();
  for (const w of windows) {
    const list = byTrainer.get(w.trainerId) ?? [];
    list.push(w);
    byTrainer.set(w.trainerId, list);
  }

  const offerings = [];
  for (const [trainerId, tWindows] of byTrainer) {
    const trainer = tWindows[0].trainer;
    const days: {
      date: string;
      ranges: {
        start: string;
        end: string;
        durationMins: number;
        priceGHS: number;
        locationId: string;
        locationName: string;
      }[];
    }[] = [];

    for (const date of dates) {
      if (blockedDays.has(`${trainerId}|${date}`)) continue;
      const dow = new Date(date + "T00:00:00.000Z").getUTCDay();
      const busy = busyByTrainerDay.get(`${trainerId}|${date}`) ?? [];
      const ranges: (typeof days)[number]["ranges"] = [];

      for (const w of tWindows.filter((x) => x.dayOfWeek === dow)) {
        let winStart = toMinutes(w.startTime);
        const winEnd = toMinutes(w.endTime);
        if (date === todayStr) winStart = Math.max(winStart, nowMinutes + cutoffMin);
        if (winEnd - winStart < w.durationMins) continue;
        for (const r of freeRanges(winStart, winEnd, busy, w.durationMins)) {
          ranges.push({
            start: fromMinutes(r.start),
            end: fromMinutes(r.end),
            durationMins: w.durationMins,
            priceGHS: w.priceGHS,
            locationId: w.location.id,
            locationName: w.location.name,
          });
        }
      }
      if (ranges.length > 0) {
        ranges.sort((a, b) => a.start.localeCompare(b.start));
        days.push({ date, ranges });
      }
    }

    if (days.length === 0) continue;
    const prices = days.flatMap((d) => d.ranges.map((r) => r.priceGHS));
    offerings.push({
      trainerId,
      trainerName: trainer.user.name,
      specialty: trainer.specialty,
      bio: trainer.bio,
      photoUrl: trainer.photoUrl,
      calendarColor: trainer.calendarColor,
      title: tWindows.find((w) => w.title)?.title ?? "",
      durationMins: days[0].ranges[0].durationMins,
      priceGHS: Math.min(...prices),
      stepMins: STEP_MINS,
      days,
    });
  }

  offerings.sort((a, b) => a.trainerName.localeCompare(b.trainerName));
  return NextResponse.json({ offerings });
});
