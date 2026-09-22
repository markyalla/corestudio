import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";

/** Bookable sessions within the studio's advance-booking window, with
 *  capacity/taken counts and the member's own booking status per session —
 *  what the Book tab's timetable needs. */
export const GET = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const studio = await prisma.studio.findFirstOrThrow();
  const member = await prisma.member.findFirst({ where: { userId: auth.user.id } });
  if (!member) throw new ApiError(404, "No member profile for this account");

  const now = new Date();
  const windowEnd = new Date(now.getTime() + studio.advanceBookingDays * 24 * 60 * 60 * 1000);

  // Once a member has picked their studio location, only show sessions at
  // that location (plus any session with no location assigned).
  const locationFilter = member.preferredLocationId
    ? { OR: [{ locationId: member.preferredLocationId }, { locationId: null }] }
    : {};

  const sessions = await prisma.session.findMany({
    where: { startsAt: { gte: now, lte: windowEnd }, status: "SCHEDULED", ...locationFilter },
    include: {
      classType: true,
      trainer: { include: { user: true } },
      location: true,
      bookings: {
        where: { memberId: member.id, status: { in: ["BOOKED", "WAITLIST", "ATTENDED"] } },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const counts = await prisma.booking.groupBy({
    by: ["sessionId"],
    where: { sessionId: { in: sessions.map((s) => s.id) }, status: { in: ["BOOKED", "ATTENDED"] } },
    _count: true,
  });
  const takenMap = new Map(counts.map((c) => [c.sessionId, c._count]));

  return NextResponse.json({
    advanceBookingDays: studio.advanceBookingDays,
    cancelCutoffHours: studio.cancelCutoffHours,
    bookingCutoffMinutes: studio.bookingCutoffMinutes,
    sessions: sessions.map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      durationMins: s.durationMins,
      capacity: s.capacity,
      taken: takenMap.get(s.id) ?? 0,
      priceGHS: s.priceGHS,
      classType: s.classType
        ? { id: s.classType.id, name: s.classType.name, description: s.classType.description }
        : null,
      trainer: {
        id: s.trainer.id,
        name: s.trainer.user.name,
        specialty: s.trainer.specialty,
        bio: s.trainer.bio,
        photoUrl: s.trainer.photoUrl,
        calendarColor: s.trainer.calendarColor,
      },
      location: s.location ? { id: s.location.id, name: s.location.name, address: s.location.address } : null,
      myStatus: s.bookings[0]?.status ?? null,
    })),
  });
});
