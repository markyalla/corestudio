import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

/** Member profile + plan + wallet + recent payment history. */
export const GET = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, "ANY");
  const member = await prisma.member.findFirst({
    where: { userId: auth.user.id },
    include: {
      user: true,
      plan: { include: { perks: { where: { active: true } } } },
      payments: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });
  if (!member) {
    return NextResponse.json({ error: "No member profile for this account" }, { status: 404 });
  }

  // Payment <-> Booking isn't a direct relation (a payment can also be a
  // plan renewal, with no booking at all) — link them by their shared
  // Paystack reference so the payment detail screen can show whether the
  // class it paid for is still booked or was since cancelled.
  const refs = member.payments.map((p) => p.paystackRef).filter((r): r is string => !!r);
  const linkedBookings = refs.length
    ? await prisma.booking.findMany({
        where: { paystackRef: { in: refs } },
        include: { session: { include: { classType: true, trainer: { include: { user: true } } } } },
      })
    : [];
  const bookingByRef = new Map(linkedBookings.map((b) => [b.paystackRef as string, b]));

  return NextResponse.json({
    member: {
      id: member.id,
      status: member.status,
      creditsLeft: member.creditsLeft,
      walletGHS: member.walletGHS,
      cycleRenewsAt: member.cycleRenewsAt,
      joinedAt: member.joinedAt,
    },
    user: { name: member.user.name, email: member.user.email, phone: member.user.phone },
    plan: member.plan
      ? {
          id: member.plan.id,
          name: member.plan.name,
          priceGHS: member.plan.priceGHS,
          classesPerCycle: member.plan.classesPerCycle,
          bonusCredits: member.plan.bonusCredits,
          cycleDays: member.plan.cycleDays,
          perks: member.plan.perks.map((perk) => perk.name),
        }
      : null,
    payments: member.payments.map((p) => {
      const booking = p.paystackRef ? bookingByRef.get(p.paystackRef) : undefined;
      return {
        id: p.id,
        amountGHS: p.amountGHS,
        method: p.method,
        description: p.description,
        status: p.status,
        paystackRef: p.paystackRef,
        createdAt: p.createdAt,
        booking: booking
          ? {
              id: booking.id,
              status: booking.status,
              session: {
                startsAt: booking.session.startsAt,
                classType: booking.session.classType ? { name: booking.session.classType.name } : null,
                trainer: { name: booking.session.trainer.user.name },
              },
            }
          : null,
      };
    }),
  });
});

export const PATCH = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, "ANY");
  const body = schema.parse(await req.json());

  const data: { name?: string; passwordHash?: string } = {};
  if (body.name) data.name = body.name;

  if (body.newPassword) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    const ok = await bcrypt.compare(body.currentPassword ?? "", user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Current password is wrong" }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.newPassword, 10);
  }

  await prisma.user.update({ where: { id: auth.user.id }, data });
  await audit(prisma, {
    userId: auth.user.id,
    action: "user.profile_update",
    entity: "User",
    entityId: auth.user.id,
    payload: { changed: Object.keys(data) },
  });
  return NextResponse.json({ ok: true });
});
