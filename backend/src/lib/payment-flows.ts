import { prisma } from "./prisma";
import { audit } from "./audit";
import { ApiError } from "./errors";
import { getNotificationService } from "./notifications";
import { formatGHS } from "./money";
import {
  type ChargeMetadata,
  channelToMethod,
  initializeTransaction,
  newReference,
} from "./paystack";
import type { Member, MembershipPlan, Prisma, Session, User } from "@prisma/client";

function appUrl(path: string): string {
  return `${process.env.BACKEND_PUBLIC_URL ?? "http://localhost:4000"}${path}`;
}

// Paystack redirects the mobile browser here when checkout finishes. The RN
// app opens the checkout via WebBrowser.openAuthSessionAsync with this exact
// URL prefix as its redirect target, so it auto-closes and hands the final
// URL (with ?reference=&status=) back to the app — no deep link needed.
const PAY_CALLBACK_PATH = "/api/app/pay/callback";

/** Rule 1: no credits and wallet can't cover — charge price minus wallet via Paystack.
 *  The booking itself is created only when the webhook confirms the charge. */
export async function startBookingCheckout(opts: {
  member: Member & { user: User };
  session: Session;
  className: string;
}) {
  const walletApplied = Math.min(opts.member.walletGHS, opts.session.priceGHS);
  const charge = opts.session.priceGHS - walletApplied;
  if (charge <= 0) throw new ApiError(400, "Wallet covers this booking — no charge needed");

  const reference = newReference("bk");
  await prisma.payment.create({
    data: {
      memberId: opts.member.id,
      amountGHS: charge,
      method: "MOMO", // provisional; replaced by actual channel on webhook
      description: `Booking: ${opts.className} ${opts.session.startsAt.toISOString()}`,
      paystackRef: reference,
      status: "PENDING",
    },
  });
  const tx = await initializeTransaction({
    email: opts.member.user.email,
    amountPesewas: charge,
    reference,
    metadata: {
      kind: "BOOKING",
      sessionId: opts.session.id,
      memberId: opts.member.id,
      walletApplied,
    },
    callbackUrl: appUrl(PAY_CALLBACK_PATH),
    customerName: opts.member.user.name,
    customerPhone: opts.member.user.phone ?? undefined,
  });
  return { authorizationUrl: tx.authorization_url, reference };
}

/** Rule 6: renewal checkout for the member's plan. Also doubles as the
 *  self-serve "subscribe to this plan" checkout (GET /api/app/plans + POST
 *  /api/app/plans/:id/subscribe) — fulfilment (handleChargeSuccess, kind
 *  "RENEWAL" below) already just assigns the plan + resets credits + sets
 *  the next renewal date, which is exactly "subscribe" too, regardless of
 *  whether the member had a plan before. */
export async function startRenewalCheckout(opts: {
  member: Member & { user: User };
  plan: MembershipPlan;
  description?: string;
}) {
  const reference = newReference("rn");
  await prisma.payment.create({
    data: {
      memberId: opts.member.id,
      amountGHS: opts.plan.priceGHS,
      method: "MOMO",
      description: opts.description ?? `${opts.plan.name} renewal`,
      paystackRef: reference,
      status: "PENDING",
    },
  });
  const tx = await initializeTransaction({
    email: opts.member.user.email,
    amountPesewas: opts.plan.priceGHS,
    reference,
    metadata: { kind: "RENEWAL", memberId: opts.member.id, planId: opts.plan.id, walletApplied: 0 },
    callbackUrl: appUrl(PAY_CALLBACK_PATH),
    customerName: opts.member.user.name,
    customerPhone: opts.member.user.phone ?? undefined,
  });
  return { authorizationUrl: tx.authorization_url, reference };
}

/** Creates a PENDING cash payment for a plan — no Paystack involved. The
 *  member picked "pay with cash" in the app; staff confirm it in person at
 *  the studio (see confirmCashPlanPayment below), which is what actually
 *  activates the plan. */
export async function createCashPlanPayment(opts: {
  member: Member & { user: User };
  plan: MembershipPlan;
}) {
  const description =
    opts.member.planId === opts.plan.id
      ? `${opts.plan.name} renewal (cash — pending)`
      : `${opts.plan.name} subscription (cash — pending)`;
  const payment = await prisma.payment.create({
    data: {
      memberId: opts.member.id,
      planId: opts.plan.id,
      amountGHS: opts.plan.priceGHS,
      method: "CASH",
      description,
      status: "PENDING",
    },
  });
  return payment;
}

/** Staff confirms a member's pending cash payment (they've paid in person)
 *  — flips it to CONFIRMED and, if it's for a plan, activates it via the
 *  same logic a successful Paystack renewal/subscription uses. */
export async function confirmCashPayment(opts: { paymentId: string; actorUserId: string }) {
  const sms = getNotificationService();

  const outcome = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: opts.paymentId } });
    if (!payment) throw new ApiError(404, "Payment not found");
    if (payment.method !== "CASH") throw new ApiError(400, "Not a cash payment");
    if (payment.status !== "PENDING") throw new ApiError(400, `Payment is already ${payment.status}`);

    await tx.payment.update({ where: { id: payment.id }, data: { status: "CONFIRMED" } });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "payment.confirm_cash",
      entity: "Payment",
      entityId: payment.id,
      payload: { memberId: payment.memberId, planId: payment.planId },
    });

    if (!payment.planId) return { note: "no plan on this payment" };
    return activateMembership(tx, { memberId: payment.memberId, planId: payment.planId });
  });

  if ("phone" in outcome && outcome.phone) {
    await sms.sendSms(outcome.phone, outcome.message!);
  }
  return outcome;
}

/** Rule 3: payment link for a promoted waitlist spot (2-hour window). */
export async function startWaitlistClaimCheckout(opts: {
  bookingId: string;
  userEmail: string;
  userName: string;
  userPhone?: string | null;
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: opts.bookingId },
    include: { session: { include: { classType: true } }, member: true },
  });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.status !== "WAITLIST" || !booking.promotionExpiresAt) {
    throw new ApiError(400, "This booking has no open payment window");
  }
  if (booking.promotionExpiresAt < new Date()) {
    throw new ApiError(410, "The 2-hour payment window has expired");
  }

  const reference = newReference("wl");
  await prisma.payment.create({
    data: {
      memberId: booking.memberId,
      amountGHS: booking.session.priceGHS,
      method: "MOMO",
      description: `Waitlist spot: ${booking.session.classType?.name ?? "PT"}`,
      paystackRef: reference,
      status: "PENDING",
    },
  });
  const tx = await initializeTransaction({
    email: opts.userEmail,
    amountPesewas: booking.session.priceGHS,
    reference,
    metadata: { kind: "WAITLIST_CLAIM", bookingId: booking.id },
    callbackUrl: appUrl(PAY_CALLBACK_PATH),
    customerName: opts.userName,
    customerPhone: opts.userPhone ?? undefined,
  });
  return { authorizationUrl: tx.authorization_url, reference };
}

/**
 * Assigns a plan to a member: adds the plan's credits to whatever they
 * already have (switching plans or renewing early doesn't wipe out unused
 * credits) and extends cycleRenewsAt from their current renewal date if
 * it's still in the future, else from now. Shared by both the Paystack
 * success path (handleChargeSuccess, kind "RENEWAL") and staff confirming a
 * cash payment (confirmCashPayment above) — same effect either way.
 */
async function activateMembership(
  tx: Prisma.TransactionClient,
  opts: { memberId: string; planId: string; reference?: string },
) {
  const member = await tx.member.findUnique({ where: { id: opts.memberId }, include: { user: true } });
  const plan = await tx.membershipPlan.findUnique({ where: { id: opts.planId } });
  if (!member || !plan) return { note: "member/plan gone" };

  const base =
    member.cycleRenewsAt && member.cycleRenewsAt > new Date() ? member.cycleRenewsAt : new Date();
  const totalClasses = plan.classesPerCycle + plan.bonusCredits;
  await tx.member.update({
    where: { id: member.id },
    data: {
      planId: plan.id,
      status: "ACTIVE",
      creditsLeft: { increment: totalClasses },
      cycleRenewsAt: new Date(base.getTime() + plan.cycleDays * 24 * 60 * 60 * 1000),
    },
  });
  await audit(tx, {
    userId: member.userId,
    action: "member.plan_activated",
    entity: "Member",
    entityId: member.id,
    payload: { planId: plan.id, reference: opts.reference },
  });
  return {
    phone: member.user.phone,
    message: `Your ${plan.name} plan is active — ${totalClasses} classes added. See you in the studio!`,
  };
}

/**
 * Fulfils a successful charge. Idempotent: keyed on the Payment row by
 * paystackRef — a second delivery (webhook retry, verify fallback) is a no-op.
 */
export async function handleChargeSuccess(event: {
  reference: string;
  amount: number;
  channel: string;
  metadata: ChargeMetadata | null;
}) {
  const sms = getNotificationService();

  const outcome = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { paystackRef: event.reference } });
    if (!payment) return { note: "unknown reference" };
    if (payment.status === "CONFIRMED") return { note: "already processed" };

    const method = channelToMethod(event.channel);
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "CONFIRMED", method },
    });

    const meta = event.metadata;
    if (!meta) return { note: "no metadata" };

    if (meta.kind === "BOOKING") {
      const session = await tx.session.findUnique({
        where: { id: meta.sessionId },
        include: { classType: true },
      });
      const member = await tx.member.findUnique({
        where: { id: meta.memberId },
        include: { user: true },
      });
      if (!session || !member) return { note: "session/member gone" };

      // Wallet portion promised at checkout — clamp to what's still there
      const walletApplied = Math.min(meta.walletApplied ?? 0, member.walletGHS);
      const taken = await tx.booking.count({
        where: { sessionId: session.id, status: { in: ["BOOKED", "ATTENDED"] } },
      });

      if (taken >= session.capacity || session.status !== "SCHEDULED") {
        // Spot vanished while paying — money goes to the wallet, member waitlisted
        await tx.member.update({
          where: { id: member.id },
          data: { walletGHS: { increment: payment.amountGHS } },
        });
        const booking = await tx.booking.create({
          data: { sessionId: session.id, memberId: member.id, status: "WAITLIST", amountGHS: 0 },
        });
        await audit(tx, {
          userId: member.userId, action: "booking.paid_but_full", entity: "Booking",
          entityId: booking.id, payload: { refundedToWallet: payment.amountGHS },
        });
        return {
          phone: member.user.phone,
          message: `That class filled up before payment completed. ${formatGHS(payment.amountGHS)} was added to your wallet and you're on the waitlist.`,
        };
      }

      if (walletApplied > 0) {
        await tx.member.update({
          where: { id: member.id },
          data: { walletGHS: { decrement: walletApplied } },
        });
      }
      const booking = await tx.booking.create({
        data: {
          sessionId: session.id,
          memberId: member.id,
          status: "BOOKED",
          paidWith: method,
          amountGHS: session.priceGHS,
          paystackRef: event.reference,
        },
      });
      await audit(tx, {
        userId: member.userId, action: "booking.create_paid", entity: "Booking",
        entityId: booking.id, payload: { reference: event.reference, walletApplied },
      });
      return {
        phone: member.user.phone,
        message: `Payment received — you're booked for ${session.classType?.name ?? "your session"} on ${session.startsAt.toISOString().slice(0, 16).replace("T", " ")}.`,
      };
    }

    if (meta.kind === "RENEWAL") {
      return activateMembership(tx, {
        memberId: meta.memberId,
        planId: meta.planId,
        reference: event.reference,
      });
    }

    if (meta.kind === "WAITLIST_CLAIM") {
      const booking = await tx.booking.findUnique({
        where: { id: meta.bookingId },
        include: {
          session: { include: { classType: true } },
          member: { include: { user: true } },
        },
      });
      if (!booking) return { note: "booking gone" };

      const taken = await tx.booking.count({
        where: { sessionId: booking.sessionId, status: { in: ["BOOKED", "ATTENDED"] } },
      });
      if (booking.status !== "WAITLIST" || taken >= booking.session.capacity) {
        await tx.member.update({
          where: { id: booking.memberId },
          data: { walletGHS: { increment: payment.amountGHS } },
        });
        return {
          phone: booking.member.user.phone,
          message: `That spot was no longer available. ${formatGHS(payment.amountGHS)} was added to your wallet.`,
        };
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "BOOKED",
          paidWith: method,
          amountGHS: booking.session.priceGHS,
          paystackRef: event.reference,
          promotionExpiresAt: null,
        },
      });
      await audit(tx, {
        userId: booking.member.userId, action: "booking.waitlist_claimed", entity: "Booking",
        entityId: booking.id, payload: { reference: event.reference },
      });
      return {
        phone: booking.member.user.phone,
        message: `You're in! ${booking.session.classType?.name ?? "Your session"} on ${booking.session.startsAt.toISOString().slice(0, 16).replace("T", " ")} is confirmed.`,
      };
    }

    return { note: "unknown kind" };
  });

  if ("phone" in outcome && outcome.phone) {
    await sms.sendSms(outcome.phone, outcome.message!);
  }
  return outcome;
}
