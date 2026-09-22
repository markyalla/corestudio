import { prisma } from "./prisma";
import { audit } from "./audit";
import { ApiError } from "./errors";
import type { Prisma } from "@prisma/client";

/**
 * Business rule 5. A booking is payout-eligible for a trainer when:
 * - it sits on one of the trainer's sessions,
 * - it is paid (amountGHS > 0 — credit/comp bookings carry no cash),
 * - it is ATTENDED, or BOOKED on a COMPLETED session,
 * - and it has never appeared in a PayoutLine.
 */
function eligibleBookingsWhere(trainerId?: string): Prisma.BookingWhereInput {
  return {
    amountGHS: { gt: 0 },
    payoutLine: null,
    OR: [
      { status: "ATTENDED" },
      { status: "BOOKED", session: { status: "COMPLETED" } },
    ],
    session: trainerId ? { trainerId } : undefined,
  };
}

export type TrainerOwed = {
  trainerId: string;
  trainerName: string;
  commissionPercent: number;
  ptCommissionPercent: number;
  grossGHS: number; // total gross (group + PT)
  ptGrossGHS: number; // PT subset of grossGHS
  amountGHS: number;
  bookingIds: string[];
  periodStart: Date | null;
  periodEnd: Date | null;
};

/**
 * Splits eligible bookings into group vs private (PT) and applies each rate.
 * amountGHS = groupGross × commissionPercent + ptGross × ptCommissionPercent.
 */
function splitPayout(
  bookings: { amountGHS: number; session: { kind: string } }[],
  commissionPercent: number,
  ptCommissionPercent: number,
) {
  const ptGrossGHS = bookings
    .filter((b) => b.session.kind === "PT")
    .reduce((sum, b) => sum + b.amountGHS, 0);
  const grossGHS = bookings.reduce((sum, b) => sum + b.amountGHS, 0);
  const groupGrossGHS = grossGHS - ptGrossGHS;
  const amountGHS =
    Math.floor((groupGrossGHS * commissionPercent) / 100) +
    Math.floor((ptGrossGHS * ptCommissionPercent) / 100);
  return { grossGHS, ptGrossGHS, amountGHS };
}

/** Computes what is currently owed to each trainer (unpaid eligible bookings × commission). */
export async function computeOwedPerTrainer(): Promise<TrainerOwed[]> {
  const trainers = await prisma.trainer.findMany({ include: { user: true } });
  const result: TrainerOwed[] = [];

  for (const trainer of trainers) {
    const bookings = await prisma.booking.findMany({
      where: eligibleBookingsWhere(trainer.id),
      include: { session: { select: { startsAt: true, kind: true } } },
      orderBy: { createdAt: "asc" },
    });
    const { grossGHS, ptGrossGHS, amountGHS } = splitPayout(
      bookings,
      trainer.commissionPercent,
      trainer.ptCommissionPercent,
    );
    const starts = bookings.map((b) => b.session.startsAt.getTime());
    result.push({
      trainerId: trainer.id,
      trainerName: trainer.user.name,
      commissionPercent: trainer.commissionPercent,
      ptCommissionPercent: trainer.ptCommissionPercent,
      grossGHS,
      ptGrossGHS,
      amountGHS,
      bookingIds: bookings.map((b) => b.id),
      periodStart: starts.length ? new Date(Math.min(...starts)) : null,
      periodEnd: starts.length ? new Date(Math.max(...starts)) : null,
    });
  }
  return result;
}

/**
 * Creates a Payout with its PayoutLines atomically. The unique constraint on
 * PayoutLine.bookingId guarantees a booking is paid out at most once, ever —
 * a concurrent double-pay attempt fails the whole transaction.
 */
export async function createPayout(opts: { trainerId: string; actorUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const trainer = await tx.trainer.findUnique({
      where: { id: opts.trainerId },
      include: { user: true },
    });
    if (!trainer) throw new ApiError(404, "Trainer not found");

    const bookings = await tx.booking.findMany({
      where: eligibleBookingsWhere(trainer.id),
      include: { session: { select: { startsAt: true, kind: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (bookings.length === 0) throw new ApiError(400, "Nothing owed to this trainer");

    const { grossGHS, ptGrossGHS, amountGHS } = splitPayout(
      bookings,
      trainer.commissionPercent,
      trainer.ptCommissionPercent,
    );
    const starts = bookings.map((b) => b.session.startsAt.getTime());

    const payout = await tx.payout.create({
      data: {
        trainerId: trainer.id,
        periodStart: new Date(Math.min(...starts)),
        periodEnd: new Date(Math.max(...starts)),
        grossGHS,
        commissionPercent: trainer.commissionPercent,
        ptGrossGHS,
        ptCommissionPercent: trainer.ptCommissionPercent,
        amountGHS,
        status: "PENDING",
        lines: {
          create: bookings.map((b) => ({ bookingId: b.id })),
        },
      },
      include: { lines: true },
    });

    await audit(tx, {
      userId: opts.actorUserId,
      action: "payout.create",
      entity: "Payout",
      entityId: payout.id,
      payload: { trainerId: trainer.id, grossGHS, ptGrossGHS, amountGHS: payout.amountGHS, lines: bookings.length },
    });
    return payout;
  });
}

/** Marks a payout PAID with the manual MoMo transfer reference. */
export async function markPayoutPaid(opts: {
  payoutId: string;
  reference: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: opts.payoutId } });
    if (!payout) throw new ApiError(404, "Payout not found");
    if (payout.status === "PAID") throw new ApiError(400, "Payout already paid");

    const updated = await tx.payout.update({
      where: { id: payout.id },
      data: { status: "PAID", paidAt: new Date(), reference: opts.reference },
    });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "payout.mark_paid",
      entity: "Payout",
      entityId: payout.id,
      payload: { reference: opts.reference },
    });
    return updated;
  });
}
