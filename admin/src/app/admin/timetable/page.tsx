import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { TimetableClient } from "./timetable-client";

export const metadata = { title: "Timetable — CoreStudio Admin" };
export const dynamic = "force-dynamic";

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  const { week } = await searchParams;
  const weekOffset = Number(week ?? 0) || 0;

  const isTrainer = session?.user?.role === "TRAINER";
  const trainer = isTrainer
    ? await prisma.trainer.findFirst({ where: { user: { id: session!.user.id } } })
    : null;

  const weekStart = mondayOf(new Date());
  weekStart.setUTCDate(weekStart.getUTCDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [sessions, classTypes, trainers, members, locations, unavailability] = await Promise.all([
    prisma.session.findMany({
      where: {
        startsAt: { gte: weekStart, lt: weekEnd },
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
      where: { date: { gte: weekStart, lt: weekEnd } },
      select: { trainerId: true, date: true },
    }),
  ]);

  return (
    <TimetableClient
      weekStart={weekStart.toISOString()}
      weekOffset={weekOffset}
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
