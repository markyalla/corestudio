import { prisma } from "./prisma";
import { promoteWaitlist } from "./booking";
import { getNotificationService } from "./notifications";
import { formatGHS } from "./money";

const DAY = 24 * 60 * 60 * 1000;
// How far ahead sessions are pre-generated from recurrence rules. Kept a bit
// wider than the max studio advanceBookingDays (90) so the whole bookable
// window is always materialised — members can plan 2-3 months out.
const GENERATE_DAYS = 100;

/** Generates sessions GENERATE_DAYS ahead from active weekly recurrence rules.
 *  The unique (recurrenceRuleId, startsAt) constraint makes this idempotent.
 *  `notBefore` (optional) skips any slot earlier than that instant — used by
 *  the schedule importer to start a fresh timetable on a specific date. */
export async function generateSessions(notBefore?: Date): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      active: true,
      // Skip rules whose month window has fully passed.
      OR: [{ validUntil: null }, { validUntil: { gt: today } }],
    },
    include: { classType: true },
  });
  const windowEnd = new Date(today.getTime() + GENERATE_DAYS * DAY);

  const unavailable = await prisma.trainerUnavailability.findMany({
    where: { trainerId: { in: rules.map((r) => r.trainerId) }, date: { gte: today, lte: windowEnd } },
  });
  const blockedKey = (trainerId: string, date: Date) => `${trainerId}|${date.toISOString().slice(0, 10)}`;
  const blocked = new Set(unavailable.map((u) => blockedKey(u.trainerId, u.date)));

  let created = 0;
  for (const rule of rules) {
    const [h, m] = rule.time.split(":").map(Number);
    for (let day = 0; day <= GENERATE_DAYS; day++) {
      const date = new Date(today.getTime() + day * DAY);
      if (date.getUTCDay() !== rule.dayOfWeek) continue;
      const startsAt = new Date(date);
      startsAt.setUTCHours(h, m, 0, 0);
      if (startsAt <= new Date()) continue;
      if (notBefore && startsAt < notBefore) continue;
      if (rule.validFrom && startsAt < rule.validFrom) continue;
      if (rule.validUntil && startsAt >= rule.validUntil) continue;

      if (blocked.has(blockedKey(rule.trainerId, date))) {
        // The rolling lookahead re-scans the same future blocked date on every
        // 5-minute cron run until it passes — without this check we'd write
        // a fresh audit row every single run for as long as it stays blocked.
        const dateStr = date.toISOString().slice(0, 10);
        const alreadyLogged = await prisma.auditLog.findFirst({
          where: {
            entity: "RecurrenceRule",
            entityId: rule.id,
            action: "session.skipped_unavailable_trainer",
            payload: { path: ["date"], equals: dateStr },
          },
        });
        if (!alreadyLogged) {
          await prisma.auditLog.create({
            data: {
              action: "session.skipped_unavailable_trainer",
              entity: "RecurrenceRule",
              entityId: rule.id,
              payload: { trainerId: rule.trainerId, date: dateStr },
            },
          });
        }
        continue;
      }

      const res = await prisma.session.createMany({
        data: [
          {
            kind: "CLASS",
            classTypeId: rule.classTypeId,
            trainerId: rule.trainerId,
            locationId: rule.locationId,
            startsAt,
            durationMins: rule.classType.durationMins,
            capacity: rule.capacity ?? rule.classType.defaultCapacity,
            priceGHS: rule.classType.priceGHS,
            recurrenceRuleId: rule.id,
          },
        ],
        skipDuplicates: true,
      });
      created += res.count;
    }
  }
  return created;
}

/** Rule 4: sessions past their end time complete; un-checked bookings → NO_SHOW. */
export async function completeSessions(): Promise<{ completed: number; noShows: number }> {
  const now = new Date();

  // Sweep abandoned private-class slots: a PT session is created up front when
  // a member starts Paystack checkout; if they never pay, it sits with zero
  // bookings. Once it's in the past, drop it so it doesn't clutter reports.
  await prisma.session.deleteMany({
    where: { kind: "PT", status: "SCHEDULED", startsAt: { lt: now }, bookings: { none: {} } },
  });

  const due = await prisma.session.findMany({
    where: { status: "SCHEDULED" },
    select: { id: true, startsAt: true, durationMins: true },
  });
  const ended = due.filter((s) => s.startsAt.getTime() + s.durationMins * 60 * 1000 < now.getTime());

  let noShows = 0;
  for (const s of ended) {
    await prisma.$transaction(async (tx) => {
      const res = await tx.booking.updateMany({
        where: { sessionId: s.id, status: "BOOKED" },
        data: { status: "NO_SHOW" },
      });
      noShows += res.count;
      // Waitlist entries on a finished session simply lapse
      await tx.booking.updateMany({
        where: { sessionId: s.id, status: "WAITLIST" },
        data: { status: "CANCELLED" },
      });
      await tx.session.update({ where: { id: s.id }, data: { status: "COMPLETED" } });
    });
  }
  return { completed: ended.length, noShows };
}

/** Rule 3: lapse expired 2-hour payment windows and promote the next member. */
export async function expireWaitlistOffers(): Promise<number> {
  const expired = await prisma.booking.findMany({
    where: { status: "WAITLIST", promotionExpiresAt: { lt: new Date() } },
    select: { id: true, sessionId: true },
  });
  for (const b of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
      await tx.auditLog.create({
        data: {
          action: "booking.waitlist_offer_expired",
          entity: "Booking",
          entityId: b.id,
        },
      });
    });
    await promoteWaitlist(b.sessionId);
  }
  return expired.length;
}

/**
 * Rule 6: on cycleRenewsAt, reset credits only when a renewal Payment is
 * CONFIRMED (covers manual cash renewals recorded at the desk — Paystack
 * renewals already reset via webhook). Unpaid after a 3-day grace → FROZEN.
 */
export async function processPlanCycles(): Promise<{ renewed: number; frozen: number }> {
  const now = new Date();
  const due = await prisma.member.findMany({
    where: { status: "ACTIVE", cycleRenewsAt: { lte: now }, planId: { not: null } },
    include: { plan: true },
  });

  let renewed = 0;
  let frozen = 0;
  for (const member of due) {
    const plan = member.plan!;
    // A confirmed renewal payment made since the last cycle started
    const payment = await prisma.payment.findFirst({
      where: {
        memberId: member.id,
        status: "CONFIRMED",
        amountGHS: { gte: plan.priceGHS },
        description: { contains: "renew", mode: "insensitive" },
        createdAt: { gte: new Date(member.cycleRenewsAt!.getTime() - plan.cycleDays * DAY) },
      },
    });

    if (payment) {
      await prisma.member.update({
        where: { id: member.id },
        data: {
          creditsLeft: plan.classesPerCycle + plan.bonusCredits,
          cycleRenewsAt: new Date(member.cycleRenewsAt!.getTime() + plan.cycleDays * DAY),
        },
      });
      renewed++;
    } else if (now.getTime() - member.cycleRenewsAt!.getTime() > 3 * DAY) {
      await prisma.member.update({ where: { id: member.id }, data: { status: "FROZEN" } });
      await prisma.auditLog.create({
        data: { action: "member.frozen_unpaid", entity: "Member", entityId: member.id },
      });
      frozen++;
    }
  }
  return { renewed, frozen };
}

/** Rule 7: booking reminders 24h and 2h out; renewal reminder 3 days before. */
export async function sendReminders(): Promise<{ h24: number; h2: number; renewal: number }> {
  const sms = getNotificationService();
  const now = new Date();
  const counts = { h24: 0, h2: 0, renewal: 0 };

  for (const [field, horizon] of [
    ["reminder24At", 24 * 60 * 60 * 1000],
    ["reminder2At", 2 * 60 * 60 * 1000],
  ] as const) {
    const bookings = await prisma.booking.findMany({
      where: {
        status: "BOOKED",
        [field]: null,
        session: {
          status: "SCHEDULED",
          startsAt: { gt: now, lte: new Date(now.getTime() + horizon) },
        },
      },
      include: {
        member: { include: { user: true } },
        session: { include: { classType: true } },
      },
    });
    for (const b of bookings) {
      if (b.member.user.phone) {
        const when = b.session.startsAt.toISOString().slice(0, 16).replace("T", " ");
        await sms.sendSms(
          b.member.user.phone,
          `Reminder: ${b.session.classType?.name ?? "your session"} ${
            field === "reminder2At" ? "starts soon" : "is tomorrow"
          } — ${when}. See you there!`,
        );
      }
      await prisma.booking.update({ where: { id: b.id }, data: { [field]: now } });
      counts[field === "reminder24At" ? "h24" : "h2"]++;
    }
  }

  const renewals = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      planId: { not: null },
      cycleRenewsAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY) },
      OR: [{ renewalReminderAt: null }, { renewalReminderAt: { lt: new Date(now.getTime() - 7 * DAY) } }],
    },
    include: { user: true, plan: true },
  });
  for (const m of renewals) {
    if (m.user.phone) {
      await sms.sendSms(
        m.user.phone,
        `Your ${m.plan!.name} plan renews on ${m.cycleRenewsAt!.toISOString().slice(0, 10)} (${formatGHS(m.plan!.priceGHS)}). Renew in the app or at the front desk.`,
      );
    }
    await prisma.member.update({ where: { id: m.id }, data: { renewalReminderAt: now } });
    counts.renewal++;
  }
  return counts;
}

export async function runAllJobs() {
  return {
    sessionsGenerated: await generateSessions(),
    ...(await completeSessions()),
    waitlistOffersExpired: await expireWaitlistOffers(),
    ...(await processPlanCycles()),
    reminders: await sendReminders(),
  };
}
