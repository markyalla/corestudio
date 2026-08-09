import { prisma } from "./prisma";
import { audit } from "./audit";
import { ApiError } from "./errors";
import { getNotificationService } from "./notifications";
import { formatGHS } from "./money";
import type { PaymentMethod, Prisma } from "@prisma/client";

/** Statuses that occupy a spot in a session. */
const OCCUPYING: ("BOOKED" | "ATTENDED")[] = ["BOOKED", "ATTENDED"];

async function lockSession(tx: Prisma.TransactionClient, sessionId: string) {
  // Serialize concurrent bookings on the same session
  await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${sessionId} FOR UPDATE`;
}

/**
 * Business rule 1. Books a member into a session.
 * - Open capacity → BOOKED, paying with a credit when available/requested.
 * - Full → WAITLIST, no charge.
 * - Non-credit methods here are front-desk/manual (CASH, COMP, recorded MOMO/CARD).
 *   Online Paystack checkout is layered on in Phase 4 and confirms via webhook.
 * Returns the created booking.
 */
export async function bookSession(opts: {
  sessionId: string;
  memberId: string;
  paidWith: PaymentMethod;
  actorUserId: string;
  // Staff booking a member in at the front desk bypasses the cutoff below —
  // it only applies to members self-booking through the app.
  isStaff?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, opts.sessionId);

    const session = await tx.session.findUnique({
      where: { id: opts.sessionId },
      include: { classType: true },
    });
    if (!session) throw new ApiError(404, "Session not found");
    if (session.status !== "SCHEDULED") throw new ApiError(400, "Session is not open for booking");
    if (session.startsAt < new Date()) throw new ApiError(400, "Session already started");

    if (!opts.isStaff) {
      const studio = await tx.studio.findFirstOrThrow();
      const cutoffMs = studio.bookingCutoffMinutes * 60 * 1000;
      if (session.startsAt.getTime() - Date.now() < cutoffMs) {
        throw new ApiError(
          400,
          `Booking closes ${studio.bookingCutoffMinutes} minutes before the session`,
        );
      }
    }

    const member = await tx.member.findUnique({
      where: { id: opts.memberId },
      include: { user: true },
    });
    if (!member) throw new ApiError(404, "Member not found");
    if (member.status === "FROZEN") throw new ApiError(400, "Membership is frozen — renew to book");
    if (member.status === "CANCELLED") throw new ApiError(400, "Membership is cancelled");

    const existing = await tx.booking.findFirst({
      where: {
        sessionId: session.id,
        memberId: member.id,
        status: { in: ["BOOKED", "WAITLIST", "ATTENDED"] },
      },
    });
    if (existing) throw new ApiError(409, "Member already has a booking for this session");

    const taken = await tx.booking.count({
      where: { sessionId: session.id, status: { in: OCCUPYING } },
    });

    // Full → waitlist, no charge
    if (taken >= session.capacity) {
      const booking = await tx.booking.create({
        data: { sessionId: session.id, memberId: member.id, status: "WAITLIST", amountGHS: 0 },
      });
      await audit(tx, {
        userId: opts.actorUserId,
        action: "booking.waitlist",
        entity: "Booking",
        entityId: booking.id,
        payload: { sessionId: session.id, memberId: member.id },
      });
      return booking;
    }

    let paidWith = opts.paidWith;
    let amountGHS = 0;

    if (paidWith === "CREDIT") {
      if (member.creditsLeft <= 0) throw new ApiError(400, "No credits left on plan");
      await tx.member.update({
        where: { id: member.id },
        data: { creditsLeft: { decrement: 1 } },
      });
    } else if (paidWith === "COMP") {
      amountGHS = 0;
    } else {
      // CASH / MOMO / CARD / WALLET — wallet balance applies first (rule 2).
      // The booking carries the full price; a Payment row records only the
      // freshly collected remainder.
      amountGHS = session.priceGHS;
      const walletApplied = Math.min(member.walletGHS, amountGHS);
      if (walletApplied > 0) {
        await tx.member.update({
          where: { id: member.id },
          data: { walletGHS: { decrement: walletApplied } },
        });
      }
      const remainder = amountGHS - walletApplied;
      if (remainder > 0) {
        if (paidWith === "WALLET") {
          throw new ApiError(400, "Insufficient wallet balance");
        }
        await tx.payment.create({
          data: {
            memberId: member.id,
            amountGHS: remainder,
            method: paidWith,
            description: `Booking: ${session.classType?.name ?? "PT"} ${session.startsAt.toISOString()}`,
            status: "CONFIRMED",
          },
        });
      } else {
        paidWith = "WALLET";
      }
    }

    const booking = await tx.booking.create({
      data: {
        sessionId: session.id,
        memberId: member.id,
        status: "BOOKED",
        paidWith,
        amountGHS,
      },
    });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "booking.create",
      entity: "Booking",
      entityId: booking.id,
      payload: { sessionId: session.id, memberId: member.id, paidWith, amountGHS },
    });
    return booking;
  });
}

/**
 * Business rule 2. Cancels a booking.
 * Members only outside the cutoff window; staff anytime.
 * Credit bookings refund the credit; paid bookings get a wallet credit.
 * Rule 3: cancelling a BOOKED spot promotes the oldest waitlisted member.
 */
export async function cancelBooking(opts: {
  bookingId: string;
  actorUserId: string;
  isStaff: boolean;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: opts.bookingId },
      include: { session: true, member: true },
    });
    if (!booking) throw new ApiError(404, "Booking not found");
    if (!["BOOKED", "WAITLIST"].includes(booking.status)) {
      throw new ApiError(400, `Cannot cancel a ${booking.status} booking`);
    }

    if (!opts.isStaff) {
      const studio = await tx.studio.findFirstOrThrow();
      const cutoffMs = studio.cancelCutoffHours * 60 * 60 * 1000;
      if (Date.now() > booking.session.startsAt.getTime() - cutoffMs) {
        throw new ApiError(
          400,
          `Cancellations close ${studio.cancelCutoffHours}h before the session`,
        );
      }
    }

    const wasBooked = booking.status === "BOOKED";

    // Refunds
    if (wasBooked) {
      if (booking.paidWith === "CREDIT") {
        await tx.member.update({
          where: { id: booking.memberId },
          data: { creditsLeft: { increment: 1 } },
        });
      } else if (booking.amountGHS > 0) {
        await tx.member.update({
          where: { id: booking.memberId },
          data: { walletGHS: { increment: booking.amountGHS } },
        });
      }
    }

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
    });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "booking.cancel",
      entity: "Booking",
      entityId: booking.id,
      payload: { wasStatus: booking.status, refund: booking.paidWith },
    });

    return { updated, wasBooked, sessionId: booking.sessionId };
  });

  if (result.wasBooked) {
    await promoteWaitlist(result.sessionId);
  }
  return result.updated;
}

/**
 * Business rule 3. Promotes the oldest WAITLIST booking on a session.
 * - Member has credits → consume one, promote to BOOKED, SMS confirmation.
 * - Otherwise → set a 2-hour payment window (promotionExpiresAt) and SMS a
 *   payment link. The expiry cron (Phase 6) promotes the next member if unpaid.
 */
export async function promoteWaitlist(sessionId: string): Promise<void> {
  const sms = getNotificationService();

  const promoted = await prisma.$transaction(async (tx) => {
    await lockSession(tx, sessionId);

    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { classType: true },
    });
    if (!session || session.status !== "SCHEDULED" || session.startsAt < new Date()) return null;

    const taken = await tx.booking.count({
      where: { sessionId, status: { in: OCCUPYING } },
    });
    if (taken >= session.capacity) return null;

    const next = await tx.booking.findFirst({
      where: { sessionId, status: "WAITLIST", promotionExpiresAt: null },
      orderBy: { createdAt: "asc" },
      include: { member: { include: { user: true } } },
    });
    if (!next) return null;

    const when = session.startsAt.toISOString().slice(0, 16).replace("T", " ");
    const className = session.classType?.name ?? "PT session";

    if (next.member.creditsLeft > 0) {
      await tx.member.update({
        where: { id: next.memberId },
        data: { creditsLeft: { decrement: 1 } },
      });
      const booking = await tx.booking.update({
        where: { id: next.id },
        data: { status: "BOOKED", paidWith: "CREDIT", amountGHS: 0 },
      });
      await audit(tx, {
        userId: null,
        action: "booking.waitlist_promote",
        entity: "Booking",
        entityId: booking.id,
        payload: { via: "CREDIT" },
      });
      return {
        phone: next.member.user.phone,
        message: `A spot opened up in ${className} on ${when} — you're booked in! (1 credit used)`,
      };
    }

    // No credits: open a 2-hour payment window
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await tx.booking.update({
      where: { id: next.id },
      data: { promotionExpiresAt: expires },
    });
    await audit(tx, {
      userId: null,
      action: "booking.waitlist_offer",
      entity: "Booking",
      entityId: next.id,
      payload: { expires: expires.toISOString() },
    });
    const payUrl = `${process.env.ADMIN_PUBLIC_URL}/pay/${next.id}`;
    return {
      phone: next.member.user.phone,
      message: `A spot opened up in ${className} on ${when}. Pay within 2 hours to claim it: ${payUrl}`,
    };
  });

  if (promoted?.phone) {
    await sms.sendSms(promoted.phone, promoted.message);
  }
}

/** Business rule 4. Staff check-in: BOOKED → ATTENDED. */
export async function checkInBooking(opts: { bookingId: string; actorUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: opts.bookingId } });
    if (!booking) throw new ApiError(404, "Booking not found");
    if (booking.status !== "BOOKED") {
      throw new ApiError(400, `Cannot check in a ${booking.status} booking`);
    }
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "ATTENDED" },
    });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "booking.check_in",
      entity: "Booking",
      entityId: booking.id,
    });
    return updated;
  });
}

/** Staff: mark a booking NO_SHOW manually. */
export async function markNoShow(opts: { bookingId: string; actorUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: opts.bookingId } });
    if (!booking) throw new ApiError(404, "Booking not found");
    if (!["BOOKED", "ATTENDED"].includes(booking.status)) {
      throw new ApiError(400, `Cannot mark ${booking.status} as no-show`);
    }
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "NO_SHOW" },
    });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "booking.no_show",
      entity: "Booking",
      entityId: booking.id,
    });
    return updated;
  });
}

/**
 * Cancels a whole session: refunds/releases every active booking and
 * notifies members by SMS. Staff only.
 */
export async function cancelSession(opts: { sessionId: string; actorUserId: string }) {
  const sms = getNotificationService();

  const notify = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: opts.sessionId },
      include: {
        classType: true,
        bookings: {
          where: { status: { in: ["BOOKED", "WAITLIST"] } },
          include: { member: { include: { user: true } } },
        },
      },
    });
    if (!session) throw new ApiError(404, "Session not found");
    if (session.status !== "SCHEDULED") throw new ApiError(400, "Session is not scheduled");

    const messages: { phone: string | null; message: string }[] = [];
    const when = session.startsAt.toISOString().slice(0, 16).replace("T", " ");
    const className = session.classType?.name ?? "PT session";

    for (const b of session.bookings) {
      if (b.status === "BOOKED") {
        if (b.paidWith === "CREDIT") {
          await tx.member.update({
            where: { id: b.memberId },
            data: { creditsLeft: { increment: 1 } },
          });
        } else if (b.amountGHS > 0) {
          await tx.member.update({
            where: { id: b.memberId },
            data: { walletGHS: { increment: b.amountGHS } },
          });
        }
      }
      await tx.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
      messages.push({
        phone: b.member.user.phone,
        message:
          b.paidWith === "CREDIT"
            ? `${className} on ${when} was cancelled. Your credit has been refunded.`
            : b.amountGHS > 0
              ? `${className} on ${when} was cancelled. ${formatGHS(b.amountGHS)} was added to your wallet.`
              : `${className} on ${when} was cancelled.`,
      });
    }

    await tx.session.update({ where: { id: session.id }, data: { status: "CANCELLED" } });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "session.cancel",
      entity: "Session",
      entityId: session.id,
      payload: { bookingsReleased: session.bookings.length },
    });
    return messages;
  });

  for (const m of notify) {
    if (m.phone) await sms.sendSms(m.phone, m.message);
  }
}
