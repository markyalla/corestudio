import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { bookSession } from "@/lib/booking";
import { startBookingCheckout } from "@/lib/payment-flows";
import type { PaymentMethod } from "@prisma/client";

const schema = z.object({ sessionId: z.string().min(1) });

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

  const now = Date.now();
  const cutoffMs = studio.cancelCutoffHours * 60 * 60 * 1000;

  return NextResponse.json({
    cancelCutoffHours: studio.cancelCutoffHours,
    bookings: bookings.map((b) => ({
      id: b.id,
      status: b.status,
      amountGHS: b.amountGHS,
      promotionExpiresAt: b.promotionExpiresAt,
      session: {
        id: b.session.id,
        startsAt: b.session.startsAt,
        durationMins: b.session.durationMins,
        classType: b.session.classType ? { name: b.session.classType.name } : null,
        trainer: { name: b.session.trainer.user.name },
        location: b.session.location ? { name: b.session.location.name, address: b.session.location.address } : null,
      },
      canCancel: b.status === "BOOKED" && b.session.startsAt.getTime() - now > cutoffMs,
    })),
  });
});

/** Member self-booking. Picks the payment source per business rule 1:
 *  plan credit → wallet → Paystack (Phase 4). Full sessions become WAITLIST. */
export const POST = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const { sessionId } = schema.parse(await req.json());

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

  let paidWith: PaymentMethod;
  if (isFull) {
    paidWith = "CREDIT"; // irrelevant — bookSession waitlists before charging
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
      className: session.classType?.name ?? "PT",
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
