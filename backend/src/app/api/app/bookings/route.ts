import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { bookSession, bookSessionCash } from "@/lib/booking";
import { startBookingCheckout } from "@/lib/payment-flows";
import type { PaymentMethod } from "@prisma/client";

const schema = z.object({
  sessionId: z.string().min(1),
  // "cash" → book now, pay in person; staff confirm the PENDING payment.
  method: z.enum(["cash"]).optional(),
});

/** Member's own bookings (upcoming + history), for the Bookings tab and the
 *  Home screen's "next booking" card. */
export const GET = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const studio = await prisma.studio.findFirstOrThrow();
  const member = await prisma.member.findFirst({ where: { userId: auth.user.id } });
  if (!member) throw new ApiError(404, "No member profile for this account");

  const bookings = await prisma.booking.findMany({
    where: { memberId: member.id },
    include: {
      session: { include: { classType: true, trainer: { include: { user: true } }, location: true } },
    },
    orderBy: { session: { startsAt: "desc" } },
  });

  // So the app can navigate straight from a booking (Home's "next booking"
  // card, Bookings tab) into the full session detail screen, which needs
  // occupancy — not just this member's own status.
  const takenCounts = await prisma.booking.groupBy({
    by: ["sessionId"],
    where: { sessionId: { in: bookings.map((b) => b.sessionId) }, status: { in: ["BOOKED", "ATTENDED"] } },
    _count: true,
  });
  const takenMap = new Map(takenCounts.map((c) => [c.sessionId, c._count]));

  const now = Date.now();
  const cutoffMs = studio.cancelCutoffHours * 60 * 60 * 1000;

  return NextResponse.json({
    cancelCutoffHours: studio.cancelCutoffHours,
    bookingCutoffMinutes: studio.bookingCutoffMinutes,
    bookings: bookings.map((b) => ({
      id: b.id,
      status: b.status,
      amountGHS: b.amountGHS,
      cancelReason: b.cancelReason,
      promotionExpiresAt: b.promotionExpiresAt,
      session: {
        id: b.session.id,
        startsAt: b.session.startsAt,
        durationMins: b.session.durationMins,
        capacity: b.session.capacity,
        taken: takenMap.get(b.session.id) ?? 0,
        priceGHS: b.session.priceGHS,
        classType: b.session.classType
          ? { id: b.session.classType.id, name: b.session.classType.name, description: b.session.classType.description }
          : null,
        trainer: {
          id: b.session.trainer.id,
          name: b.session.trainer.user.name,
          specialty: b.session.trainer.specialty,
          bio: b.session.trainer.bio,
          photoUrl: b.session.trainer.photoUrl,
          calendarColor: b.session.trainer.calendarColor,
        },
        location: b.session.location
          ? { id: b.session.location.id, name: b.session.location.name, address: b.session.location.address }
          : null,
      },
      canCancel: b.status === "BOOKED" && b.session.startsAt.getTime() - now > cutoffMs,
    })),
  });
});

/** Member self-booking. Picks the payment source per business rule 1:
 *  plan credit → wallet → Paystack (Phase 4). Full sessions become WAITLIST. */
export const POST = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const { sessionId, method } = schema.parse(await req.json());

  const member = await prisma.member.findFirst({
    where: { userId: auth.user.id },
    include: { user: true },
  });
  if (!member) throw new ApiError(404, "No member profile for this account");

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { classType: true },
  });
  if (!session) throw new ApiError(404, "Session not found");

  // Explicit "pay at the studio" — book now, staff confirm the cash payment.
  if (method === "cash") {
    const booking = await bookSessionCash({ sessionId, memberId: member.id, actorUserId: auth.user.id });
    return NextResponse.json({ booking, cash: true }, { status: 201 });
  }

  // Checked here (not just inside bookSession()) so it also covers the
  // Paystack checkout path below, which creates the booking later via the
  // webhook/verify callback rather than through bookSession() directly.
  const studio = await prisma.studio.findFirstOrThrow();
  const cutoffMs = studio.bookingCutoffMinutes * 60 * 1000;
  if (session.startsAt.getTime() - Date.now() < cutoffMs) {
    throw new ApiError(400, `Booking closes ${studio.bookingCutoffMinutes} minutes before the session`);
  }

  const taken = await prisma.booking.count({
    where: { sessionId, status: { in: ["BOOKED", "ATTENDED"] } },
  });
  const isFull = taken >= session.capacity;

  const hasPackage =
    !isFull &&
    !!session.classTypeId &&
    (await prisma.memberPackage.count({
      where: {
        memberId: member.id,
        package: { classTypeId: session.classTypeId },
        sessionsLeft: { gt: 0 },
        expiresAt: { gt: new Date() },
      },
    })) > 0;

  let paidWith: PaymentMethod;
  if (isFull) {
    paidWith = "CREDIT"; // irrelevant — bookSession waitlists before charging
  } else if (hasPackage) {
    // A package is already paid for and scoped to this exact service — use
    // it ahead of the generic plan credit.
    paidWith = "PACKAGE";
  } else if (member.creditsLeft > 0) {
    paidWith = "CREDIT";
  } else if (session.priceGHS === 0) {
    paidWith = "COMP";
  } else if (member.walletGHS >= session.priceGHS) {
    paidWith = "WALLET";
  } else {
    // Rule 1: initialize a Paystack charge; the booking is created only when
    // the webhook (or verify fallback) confirms payment.
    if (member.status !== "ACTIVE") {
      throw new ApiError(400, "Membership is not active — renew to book");
    }
    const { authorizationUrl, reference } = await startBookingCheckout({
      member,
      session,
      className: session.classType?.name ?? "Private class",
    });
    return NextResponse.json({ authorizationUrl, reference }, { status: 200 });
  }

  const booking = await bookSession({
    sessionId,
    memberId: member.id,
    paidWith,
    actorUserId: auth.user.id,
  });
  return NextResponse.json({ booking }, { status: 201 });
});
