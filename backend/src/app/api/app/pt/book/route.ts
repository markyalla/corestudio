import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { bookSession, bookSessionCash } from "@/lib/booking";
import { startBookingCheckout } from "@/lib/payment-flows";
import {
  assertTrainerAvailable,
  findTrainerSessionClash,
  lockTrainer,
} from "@/lib/availability";
import { ptStartsAt, toMinutes } from "@/lib/pt";

const schema = z.object({
  trainerId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  method: z.enum(["cash"]).optional(),
});

/** Books a private (one-on-one) class: creates a PT Session at the member's
 *  chosen time inside one of the trainer's availability windows, then pays for
 *  it with the same cascade as a group booking (credit → wallet → Paystack),
 *  or records a pending cash payment. */
export const POST = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const body = schema.parse(await req.json());

  const member = await prisma.member.findFirst({
    where: { userId: auth.user.id },
    include: { user: true },
  });
  if (!member) throw new ApiError(404, "No member profile for this account");
  const studio = await prisma.studio.findFirstOrThrow();

  // 1. Create the PT session atomically — the trainer row lock serialises
  //    concurrent private bookings so overlapping times can't both land.
  const session = await prisma.$transaction(async (tx) => {
    await lockTrainer(tx, body.trainerId);

    const dow = new Date(`${body.date}T00:00:00.000Z`).getUTCDay();
    const startMin = toMinutes(body.startTime);
    const windows = await tx.ptWindow.findMany({
      where: { trainerId: body.trainerId, dayOfWeek: dow, active: true },
    });
    const win = windows.find(
      (w) => startMin >= toMinutes(w.startTime) && startMin + w.durationMins <= toMinutes(w.endTime),
    );
    if (!win) throw new ApiError(404, "That time isn't in the trainer's private-class availability");

    const startsAt = ptStartsAt(body.date, body.startTime);
    if (startsAt.getTime() - Date.now() < studio.bookingCutoffMinutes * 60_000) {
      throw new ApiError(400, `Booking closes ${studio.bookingCutoffMinutes} minutes before the session`);
    }
    await assertTrainerAvailable(tx, body.trainerId, [startsAt]);
    const clash = await findTrainerSessionClash(tx, body.trainerId, startsAt, win.durationMins);
    if (clash) {
      throw new ApiError(
        409,
        clash.kind === "PT"
          ? "That time was just booked by another member. Please pick a different time."
          : `The trainer has ${clash.className ?? "a class"} at that time. Please pick a different time.`,
      );
    }

    return tx.session.create({
      data: {
        kind: "PT",
        trainerId: body.trainerId,
        locationId: win.locationId,
        startsAt,
        durationMins: win.durationMins,
        capacity: 1,
        priceGHS: win.priceGHS,
      },
    });
  });

  // 2. Pay for it. On any synchronous failure, drop the empty session so a
  //    failed attempt doesn't leave a ghost slot (Paystack abandonment is
  //    swept by completeSessions() instead).
  try {
    if (body.method === "cash") {
      const booking = await bookSessionCash({
        sessionId: session.id, memberId: member.id, actorUserId: auth.user.id,
      });
      return NextResponse.json({ cash: true, booking }, { status: 201 });
    }

    if (member.creditsLeft > 0) {
      const booking = await bookSession({
        sessionId: session.id, memberId: member.id, paidWith: "CREDIT", actorUserId: auth.user.id,
      });
      return NextResponse.json({ booking }, { status: 201 });
    }
    if (session.priceGHS === 0) {
      const booking = await bookSession({
        sessionId: session.id, memberId: member.id, paidWith: "COMP", actorUserId: auth.user.id,
      });
      return NextResponse.json({ booking }, { status: 201 });
    }
    if (member.walletGHS >= session.priceGHS) {
      const booking = await bookSession({
        sessionId: session.id, memberId: member.id, paidWith: "WALLET", actorUserId: auth.user.id,
      });
      return NextResponse.json({ booking }, { status: 201 });
    }

    if (member.status !== "ACTIVE") throw new ApiError(400, "Membership is not active — renew to book");
    const { authorizationUrl, reference } = await startBookingCheckout({
      member, session, className: "Private class",
    });
    return NextResponse.json({ authorizationUrl, reference }, { status: 200 });
  } catch (e) {
    await prisma.session.deleteMany({ where: { id: session.id, bookings: { none: {} } } });
    throw e;
  }
});
