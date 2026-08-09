import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bookSession, cancelBooking, promoteWaitlist } from "@/lib/booking";
import { computeOwedPerTrainer, createPayout } from "@/lib/payouts";
import { makeMember, makeSession, makeStudio, makeTrainer, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await makeStudio(12);
});

describe("credit consumption (rule 1)", () => {
  it("consumes one credit on booking", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({ trainerId: trainer.id });
    const member = await makeMember({ creditsLeft: 5 });

    const booking = await bookSession({
      sessionId: session.id,
      memberId: member.id,
      paidWith: "CREDIT",
      actorUserId: member.userId,
    });

    expect(booking.status).toBe("BOOKED");
    expect(booking.paidWith).toBe("CREDIT");
    const after = await prisma.member.findUnique({ where: { id: member.id } });
    expect(after!.creditsLeft).toBe(4);
  });

  it("rejects booking with zero credits", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({ trainerId: trainer.id });
    const member = await makeMember({ creditsLeft: 0 });

    await expect(
      bookSession({
        sessionId: session.id,
        memberId: member.id,
        paidWith: "CREDIT",
        actorUserId: member.userId,
      }),
    ).rejects.toThrow(/no credits/i);
  });

  it("waitlists on a full session without charging a credit", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({ trainerId: trainer.id, capacity: 1 });
    const first = await makeMember({ creditsLeft: 5 });
    const second = await makeMember({ creditsLeft: 5 });

    await bookSession({ sessionId: session.id, memberId: first.id, paidWith: "CREDIT", actorUserId: first.userId });
    const wl = await bookSession({ sessionId: session.id, memberId: second.id, paidWith: "CREDIT", actorUserId: second.userId });

    expect(wl.status).toBe("WAITLIST");
    const after = await prisma.member.findUnique({ where: { id: second.id } });
    expect(after!.creditsLeft).toBe(5);
  });
});

describe("waitlist promotion order (rule 3)", () => {
  it("promotes the oldest waitlisted member first", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({ trainerId: trainer.id, capacity: 1 });
    const booked = await makeMember({ creditsLeft: 5 });
    const early = await makeMember({ creditsLeft: 5 });
    const late = await makeMember({ creditsLeft: 5 });

    const b = await bookSession({ sessionId: session.id, memberId: booked.id, paidWith: "CREDIT", actorUserId: booked.userId });
    const wlEarly = await bookSession({ sessionId: session.id, memberId: early.id, paidWith: "CREDIT", actorUserId: early.userId });
    // Force a strictly older createdAt for the early entry
    await prisma.booking.update({
      where: { id: wlEarly.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    await bookSession({ sessionId: session.id, memberId: late.id, paidWith: "CREDIT", actorUserId: late.userId });

    await cancelBooking({ bookingId: b.id, actorUserId: booked.userId, isStaff: true });

    const earlyBooking = await prisma.booking.findFirst({
      where: { sessionId: session.id, memberId: early.id },
    });
    const lateBooking = await prisma.booking.findFirst({
      where: { sessionId: session.id, memberId: late.id },
    });
    expect(earlyBooking!.status).toBe("BOOKED"); // had credits → auto-promoted
    expect(lateBooking!.status).toBe("WAITLIST");
  });

  it("opens a 2h payment window for promoted members without credits", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({ trainerId: trainer.id, capacity: 1 });
    const booked = await makeMember({ creditsLeft: 5 });
    const broke = await makeMember({ creditsLeft: 0 });

    const b = await bookSession({ sessionId: session.id, memberId: booked.id, paidWith: "CREDIT", actorUserId: booked.userId });
    await prisma.booking.create({
      data: { sessionId: session.id, memberId: broke.id, status: "WAITLIST", amountGHS: 0 },
    });

    await cancelBooking({ bookingId: b.id, actorUserId: booked.userId, isStaff: true });

    const offer = await prisma.booking.findFirst({
      where: { sessionId: session.id, memberId: broke.id },
    });
    expect(offer!.status).toBe("WAITLIST");
    expect(offer!.promotionExpiresAt).not.toBeNull();
    expect(offer!.promotionExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(offer!.promotionExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 2 * 60 * 60 * 1000 + 1000);
  });

  it("does not double-promote when the session is already full", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({ trainerId: trainer.id, capacity: 1 });
    const a = await makeMember({ creditsLeft: 5 });
    const b = await makeMember({ creditsLeft: 5 });
    await bookSession({ sessionId: session.id, memberId: a.id, paidWith: "CREDIT", actorUserId: a.userId });
    await bookSession({ sessionId: session.id, memberId: b.id, paidWith: "CREDIT", actorUserId: b.userId });

    await promoteWaitlist(session.id); // capacity still full → no-op

    const wl = await prisma.booking.findFirst({ where: { sessionId: session.id, memberId: b.id } });
    expect(wl!.status).toBe("WAITLIST");
  });
});

describe("payout computation excludes already-paid bookings (rule 5)", () => {
  it("only counts paid bookings once, ever", async () => {
    const trainer = await makeTrainer(50);
    const owner = await prisma.user.create({
      data: { name: "Owner", email: `owner${Date.now()}@test.local`, passwordHash: "x", role: "OWNER" },
    });
    const session = await makeSession({
      trainerId: trainer.id,
      priceGHS: 10000,
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      status: "COMPLETED",
    });
    const m1 = await makeMember();
    const m2 = await makeMember();
    // Two paid attended bookings + one credit booking (no cash → excluded)
    await prisma.booking.create({
      data: { sessionId: session.id, memberId: m1.id, status: "ATTENDED", paidWith: "MOMO", amountGHS: 10000 },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, memberId: m2.id, status: "BOOKED", paidWith: "CASH", amountGHS: 10000 },
    });
    const credits = await makeMember({ creditsLeft: 5 });
    await prisma.booking.create({
      data: { sessionId: session.id, memberId: credits.id, status: "ATTENDED", paidWith: "CREDIT", amountGHS: 0 },
    });

    const owedBefore = await computeOwedPerTrainer();
    const mine = owedBefore.find((o) => o.trainerId === trainer.id)!;
    expect(mine.grossGHS).toBe(20000); // ATTENDED + BOOKED-on-completed, credit excluded
    expect(mine.amountGHS).toBe(10000); // 50%

    await createPayout({ trainerId: trainer.id, actorUserId: owner.id });

    // A new paid booking accrues; the paid-out ones never reappear
    const m3 = await makeMember();
    await prisma.booking.create({
      data: { sessionId: session.id, memberId: m3.id, status: "ATTENDED", paidWith: "MOMO", amountGHS: 10000 },
    });
    const owedAfter = await computeOwedPerTrainer();
    const mineAfter = owedAfter.find((o) => o.trainerId === trainer.id)!;
    expect(mineAfter.grossGHS).toBe(10000);
    expect(mineAfter.bookingIds).toHaveLength(1);
  });

  it("a booking can never appear in two payouts (unique constraint)", async () => {
    const trainer = await makeTrainer(40);
    const owner = await prisma.user.create({
      data: { name: "Owner2", email: `owner2${Date.now()}@test.local`, passwordHash: "x", role: "OWNER" },
    });
    const session = await makeSession({
      trainerId: trainer.id,
      priceGHS: 5000,
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      status: "COMPLETED",
    });
    const m = await makeMember();
    const booking = await prisma.booking.create({
      data: { sessionId: session.id, memberId: m.id, status: "ATTENDED", paidWith: "CASH", amountGHS: 5000 },
    });

    const payout = await createPayout({ trainerId: trainer.id, actorUserId: owner.id });
    expect(payout.lines.map((l) => l.bookingId)).toContain(booking.id);

    // Direct attempt to insert a second line for the same booking must fail
    await expect(
      prisma.payoutLine.create({ data: { payoutId: payout.id, bookingId: booking.id } }),
    ).rejects.toThrow();
    // And nothing is owed anymore
    await expect(createPayout({ trainerId: trainer.id, actorUserId: owner.id })).rejects.toThrow(/nothing owed/i);
  });
});

describe("cancellation cutoff enforcement (rule 2)", () => {
  it("blocks member cancellation inside the cutoff window", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({
      trainerId: trainer.id,
      startsAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6h away, cutoff 12h
    });
    const member = await makeMember({ creditsLeft: 5 });
    const booking = await bookSession({
      sessionId: session.id, memberId: member.id, paidWith: "CREDIT", actorUserId: member.userId,
    });

    await expect(
      cancelBooking({ bookingId: booking.id, actorUserId: member.userId, isStaff: false }),
    ).rejects.toThrow(/cancellations close/i);
  });

  it("allows member cancellation outside the cutoff and refunds the credit", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({
      trainerId: trainer.id,
      startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    const member = await makeMember({ creditsLeft: 5 });
    const booking = await bookSession({
      sessionId: session.id, memberId: member.id, paidWith: "CREDIT", actorUserId: member.userId,
    });

    const cancelled = await cancelBooking({
      bookingId: booking.id, actorUserId: member.userId, isStaff: false,
    });
    expect(cancelled.status).toBe("CANCELLED");
    const after = await prisma.member.findUnique({ where: { id: member.id } });
    expect(after!.creditsLeft).toBe(5); // consumed then refunded
  });

  it("lets staff cancel inside the cutoff, refunding paid amounts to the wallet", async () => {
    const trainer = await makeTrainer();
    const session = await makeSession({
      trainerId: trainer.id,
      priceGHS: 8000,
      startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    const member = await makeMember({ creditsLeft: 0 });
    const staff = await prisma.user.create({
      data: { name: "Admin", email: `admin${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
    });
    const booking = await bookSession({
      sessionId: session.id, memberId: member.id, paidWith: "CASH", actorUserId: staff.id,
    });
    expect(booking.amountGHS).toBe(8000);

    await cancelBooking({ bookingId: booking.id, actorUserId: staff.id, isStaff: true });

    const after = await prisma.member.findUnique({ where: { id: member.id } });
    expect(after!.walletGHS).toBe(8000);
  });
});
