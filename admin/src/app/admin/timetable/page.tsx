import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { TimetableClient } from "./timetable-client";

export const metadata = { title: "Timetable — P4Studio Admin" };
export const dynamic = "force-dynamic";

type View = "day" | "week" | "month";

function utcMidnight(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}
function mondayOf(date: Date): Date {
  const d = utcMidnight(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const view: View = sp.view === "day" || sp.view === "week" ? sp.view : "month";
  const anchor =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? utcMidnight(new Date(sp.date + "T00:00:00Z")) : utcMidnight(new Date());

  // Fetch range + the grid's first day (month view pads to whole weeks).
  let rangeStart: Date;
  let rangeEnd: Date;
  let gridStart: Date;
  if (view === "day") {
    rangeStart = anchor;
    rangeEnd = addDays(anchor, 1);
    gridStart = anchor;
  } else if (view === "week") {
    rangeStart = mondayOf(anchor);
    rangeEnd = addDays(rangeStart, 7);
    gridStart = rangeStart;
  } else {
    const firstOfMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    gridStart = mondayOf(firstOfMonth);
    rangeStart = gridStart;
    rangeEnd = addDays(gridStart, 42);
  }

  const isTrainer = session?.user?.role === "TRAINER";
  const trainer = isTrainer
    ? await prisma.trainer.findFirst({ where: { user: { id: session!.user.id } } })
    : null;

  const [sessions, classTypes, trainers, members, locations, unavailability] = await Promise.all([
    prisma.session.findMany({
      where: {
        startsAt: { gte: rangeStart, lt: rangeEnd },
        ...(trainer ? { trainerId: trainer.id } : {}),
      },
      include: {
        classType: true,
        trainer: { include: { user: true } },
        location: true,
        bookings: {
          where: { status: { in: ["BOOKED", "WAITLIST", "ATTENDED", "NO_SHOW"] } },
          include: { member: { include: { user: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.classType.findMany({ where: { active: true } }),
    prisma.trainer.findMany({ include: { user: true } }),
    prisma.member.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.location.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.trainerUnavailability.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      select: { trainerId: true, date: true },
    }),
  ]);

  return (
    <TimetableClient
      view={view}
      anchor={anchor.toISOString().slice(0, 10)}
      gridStart={gridStart.toISOString().slice(0, 10)}
      isTrainer={isTrainer}
      sessions={JSON.parse(JSON.stringify(sessions))}
      classTypes={JSON.parse(JSON.stringify(classTypes))}
      trainers={JSON.parse(
        JSON.stringify(
          trainers.map((t) => ({
            id: t.id,
            name: t.user.name,
            color: t.calendarColor,
            ptRateGHS: t.ptRateGHS,
          })),
        ),
      )}
      members={JSON.parse(
        JSON.stringify(
          members.map((m) => ({
            id: m.id,
            name: m.user.name,
            creditsLeft: m.creditsLeft,
            status: m.status,
          })),
        ),
      )}
      locations={JSON.parse(JSON.stringify(locations))}
      unavailability={JSON.parse(
        JSON.stringify(
          unavailability.map((u) => ({ trainerId: u.trainerId, date: u.date.toISOString().slice(0, 10) })),
        ),
      )}
    />
  );
}
