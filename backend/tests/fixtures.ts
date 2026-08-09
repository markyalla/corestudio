import { prisma } from "@/lib/prisma";

export async function resetDb() {
  await prisma.payoutLine.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.recurrenceRule.deleteMany();
  await prisma.classType.deleteMany();
  await prisma.location.deleteMany();
  await prisma.trainerUnavailability.deleteMany();
  await prisma.member.deleteMany();
  await prisma.trainer.deleteMany();
  await prisma.membershipPlan.deleteMany();
  await prisma.perkItem.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.user.deleteMany();
  await prisma.studio.deleteMany();
}

let seq = 0;
function uniq() {
  return `${Date.now()}_${seq++}`;
}

export async function makeStudio(cancelCutoffHours = 12) {
  return prisma.studio.create({
    data: { name: "Test Studio", cancelCutoffHours },
  });
}

export async function makeMember(opts: { creditsLeft?: number; walletGHS?: number } = {}) {
  const u = uniq();
  const user = await prisma.user.create({
    data: {
      name: `Member ${u}`,
      email: `member${u}@test.local`,
      phone: `+2332${String(seq).padStart(8, "0")}`,
      passwordHash: "x",
      role: "MEMBER",
    },
  });
  return prisma.member.create({
    data: {
      userId: user.id,
      creditsLeft: opts.creditsLeft ?? 0,
      walletGHS: opts.walletGHS ?? 0,
    },
    include: { user: true },
  });
}

export async function makeTrainer(commissionPercent = 40) {
  const u = uniq();
  const user = await prisma.user.create({
    data: {
      name: `Trainer ${u}`,
      email: `trainer${u}@test.local`,
      passwordHash: "x",
      role: "TRAINER",
    },
  });
  return prisma.trainer.create({ data: { userId: user.id, commissionPercent } });
}

export async function makeSession(opts: {
  trainerId: string;
  capacity?: number;
  priceGHS?: number;
  startsAt?: Date;
  status?: "SCHEDULED" | "COMPLETED" | "CANCELLED";
}) {
  return prisma.session.create({
    data: {
      kind: "CLASS",
      classTypeId: (
        await prisma.classType.create({
          data: { name: `Class ${uniq()}`, priceGHS: opts.priceGHS ?? 10000 },
        })
      ).id,
      trainerId: opts.trainerId,
      startsAt: opts.startsAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      durationMins: 55,
      capacity: opts.capacity ?? 6,
      priceGHS: opts.priceGHS ?? 10000,
      status: opts.status ?? "SCHEDULED",
    },
  });
}
