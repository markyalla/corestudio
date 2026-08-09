/**
 * Seed: 1 studio, staff, 3 trainers, 4 class types, 4 plans, 8 members,
 * 3 weeks of sessions (1 past, 2 upcoming) with realistic bookings/payments.
 *
 * All seeded accounts use password: password123
 * Run: npm run db:seed
 */
import { PrismaClient, BookingStatus, PaymentMethod } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Africa/Accra is UTC+0, so UTC date math maps 1:1 to studio local time.
function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, minute);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  console.log("Clearing existing data…");
  // Order matters for FK constraints
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

  console.log("Creating studio…");
  await prisma.studio.create({
    data: {
      name: "CoreStudio Pilates",
      momoNumber: "0244000000",
      advanceBookingDays: 14,
      cancelCutoffHours: 12,
      timezone: "Africa/Accra",
    },
  });

  console.log("Creating staff…");
  await prisma.user.create({
    data: {
      name: "Abena Owusu",
      email: "owner@corestudio.test",
      phone: "+233244000001",
      passwordHash,
      role: "OWNER",
    },
  });
  await prisma.user.create({
    data: {
      name: "Kojo Mensah",
      email: "admin@corestudio.test",
      phone: "+233244000002",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Creating trainers…");
  const trainerData = [
    {
      name: "Efua Asante",
      email: "efua@corestudio.test",
      phone: "+233244000010",
      specialty: "Mat & Reformer Pilates",
      commissionPercent: 45,
      ptRateGHS: 25000, // GHS 250
      calendarColor: "#0ea5e9",
      bio: "Certified STOTT instructor with 8 years of experience.",
    },
    {
      name: "Yaw Darko",
      email: "yaw@corestudio.test",
      phone: "+233244000011",
      specialty: "Reformer & Rehab",
      commissionPercent: 40,
      ptRateGHS: 30000,
      calendarColor: "#22c55e",
      bio: "Physiotherapy background, specialises in injury recovery.",
    },
    {
      name: "Nana Adjei",
      email: "nana@corestudio.test",
      phone: "+233244000012",
      specialty: "Mat Pilates & Barre",
      commissionPercent: 40,
      ptRateGHS: 20000,
      calendarColor: "#f59e0b",
      bio: "High-energy classes with a focus on core strength.",
    },
  ];
  const trainers = [];
  for (const t of trainerData) {
    const user = await prisma.user.create({
      data: { name: t.name, email: t.email, phone: t.phone, passwordHash, role: "TRAINER" },
    });
    trainers.push(
      await prisma.trainer.create({
        data: {
          userId: user.id,
          specialty: t.specialty,
          commissionPercent: t.commissionPercent,
          ptRateGHS: t.ptRateGHS,
          calendarColor: t.calendarColor,
          bio: t.bio,
        },
      }),
    );
  }

  console.log("Creating class types…");
  const classTypes = await Promise.all(
    [
      { name: "Mat Pilates", durationMins: 55, priceGHS: 8000, defaultCapacity: 12, description: "Classic mat work for all levels." },
      { name: "Reformer Flow", durationMins: 55, priceGHS: 15000, defaultCapacity: 6, description: "Dynamic reformer sequence. Intermediate+." },
      { name: "Barre Fusion", durationMins: 45, priceGHS: 7000, defaultCapacity: 10, description: "Ballet-inspired sculpt and burn." },
      { name: "Beginner Reformer", durationMins: 55, priceGHS: 12000, defaultCapacity: 6, description: "Slow-paced introduction to the reformer." },
    ].map((c) => prisma.classType.create({ data: c })),
  );

  console.log("Creating locations…");
  const locations = await Promise.all(
    [
      { name: "Cantonments", address: "12 Independence Ave, Cantonments" },
      { name: "Airport Residential", address: "4 Josif Broz Tito Ave, Airport" },
      { name: "Osu", address: "Oxford St, Osu" },
    ].map((l) => prisma.location.create({ data: l })),
  );

  console.log("Creating plan perks…");
  const perks = await Promise.all(
    ["Mat", "Water", "Towel", "Locker"].map((name) => prisma.perkItem.create({ data: { name } })),
  );

  console.log("Creating plans…");
  const plans = await Promise.all(
    [
      { name: "Drop-in 4", priceGHS: 30000, classesPerCycle: 4, bonusCredits: 0, cycleDays: 30, description: "4 classes a month.", perkIds: [] as string[] },
      { name: "Core 8", priceGHS: 55000, classesPerCycle: 8, bonusCredits: 0, cycleDays: 30, description: "8 classes a month.", perkIds: [perks[0].id] },
      { name: "Studio 12", priceGHS: 75000, classesPerCycle: 12, bonusCredits: 1, cycleDays: 30, description: "12 classes a month.", perkIds: [perks[0].id, perks[1].id] },
      { name: "Unlimited", priceGHS: 110000, classesPerCycle: 6, bonusCredits: 1, cycleDays: 30, description: "6 classes a month, plus 1 free.", perkIds: perks.map((p) => p.id) },
    ].map(({ perkIds, ...p }) =>
      prisma.membershipPlan.create({ data: { ...p, perks: { connect: perkIds.map((id) => ({ id })) } } }),
    ),
  );

  console.log("Creating members…");
  const memberData = [
    { name: "Ama Boateng", email: "ama@member.test", phone: "+233200000001", plan: 3, creditsLeft: 7 },
    { name: "Kofi Appiah", email: "kofi@member.test", phone: "+233200000002", plan: 1, creditsLeft: 5 },
    { name: "Esi Nyarko", email: "esi@member.test", phone: "+233200000003", plan: 2, creditsLeft: 9 },
    { name: "Kwame Ofori", email: "kwame@member.test", phone: "+233200000004", plan: 0, creditsLeft: 2 },
    { name: "Adwoa Sarpong", email: "adwoa@member.test", phone: "+233200000005", plan: 1, creditsLeft: 3 },
    { name: "Yaa Amankwah", email: "yaa@member.test", phone: "+233200000006", plan: 2, creditsLeft: 11 },
    { name: "Kobby Tetteh", email: "kobby@member.test", phone: "+233200000007", plan: 0, creditsLeft: 0 },
    { name: "Akosua Frimpong", email: "akosua@member.test", phone: "+233200000008", plan: 3, creditsLeft: 7 },
  ];
  const members = [];
  for (let i = 0; i < memberData.length; i++) {
    const m = memberData[i];
    const user = await prisma.user.create({
      data: { name: m.name, email: m.email, phone: m.phone, passwordHash, role: "MEMBER" },
    });
    const plan = plans[m.plan];
    members.push(
      await prisma.member.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "ACTIVE",
          creditsLeft: m.creditsLeft,
          walletGHS: i === 4 ? 8000 : 0, // Adwoa has a GHS 80 wallet credit
          cycleRenewsAt: at(20 - i * 2, 0),
          joinedAt: at(-60 + i * 5, 0),
        },
      }),
    );
    // Confirmed renewal payment for the current cycle
    await prisma.payment.create({
      data: {
        memberId: members[i].id,
        amountGHS: plan.priceGHS,
        method: i % 3 === 0 ? PaymentMethod.CARD : i % 3 === 1 ? PaymentMethod.MOMO : PaymentMethod.CASH,
        description: `${plan.name} renewal`,
        status: "CONFIRMED",
        createdAt: at(-10 + i, 9),
      },
    });
  }

  console.log("Creating recurrence rules + 3 weeks of sessions…");
  // Weekly template: [dayOfWeek(0=Sun), "HH:mm", classType idx, trainer idx, location idx]
  const template: [number, string, number, number, number][] = [
    [1, "06:30", 0, 2, 0], // Mon Mat — Nana — Cantonments
    [1, "17:30", 1, 0, 1], // Mon Reformer — Efua — Airport
    [2, "06:30", 2, 2, 0], // Tue Barre — Nana — Cantonments
    [2, "17:30", 3, 1, 2], // Tue Beg Reformer — Yaw — Osu
    [3, "06:30", 0, 0, 1], // Wed Mat — Efua — Airport
    [3, "17:30", 1, 1, 2], // Wed Reformer — Yaw — Osu
    [4, "06:30", 2, 2, 0], // Thu Barre — Nana — Cantonments
    [4, "17:30", 1, 0, 1], // Thu Reformer — Efua — Airport
    [5, "06:30", 0, 1, 2], // Fri Mat — Yaw — Osu
    [6, "08:00", 0, 2, 0], // Sat Mat — Nana — Cantonments
    [6, "09:30", 1, 0, 1], // Sat Reformer — Efua — Airport
  ];

  const rules = [];
  for (const [dow, time, ct, tr, loc] of template) {
    rules.push(
      await prisma.recurrenceRule.create({
        data: {
          dayOfWeek: dow,
          time,
          classTypeId: classTypes[ct].id,
          trainerId: trainers[tr].id,
          locationId: locations[loc].id,
        },
      }),
    );
  }

  // Generate sessions for days -7 … +13 (3 weeks) from the rules
  const sessions = [];
  for (let day = -7; day <= 13; day++) {
    const date = at(day, 0);
    const dow = date.getUTCDay();
    for (let r = 0; r < template.length; r++) {
      const [tDow, time, ct, tr, loc] = template[r];
      if (tDow !== dow) continue;
      const [h, m] = time.split(":").map(Number);
      const classType = classTypes[ct];
      sessions.push(
        await prisma.session.create({
          data: {
            kind: "CLASS",
            classTypeId: classType.id,
            trainerId: trainers[tr].id,
            locationId: locations[loc].id,
            startsAt: at(day, h, m),
            durationMins: classType.durationMins,
            capacity: classType.defaultCapacity,
            priceGHS: classType.priceGHS,
            status: day < 0 ? "COMPLETED" : "SCHEDULED",
            recurrenceRuleId: rules[r].id,
          },
        }),
      );
    }
  }

  // A couple of PT sessions with Yaw
  for (const day of [-3, 2, 6]) {
    sessions.push(
      await prisma.session.create({
        data: {
          kind: "PT",
          trainerId: trainers[1].id,
          startsAt: at(day, 12, 0),
          durationMins: 60,
          capacity: 1,
          priceGHS: trainers[1].ptRateGHS,
          status: day < 0 ? "COMPLETED" : "SCHEDULED",
        },
      }),
    );
  }

  console.log("Creating bookings…");
  let bookingCount = 0;
  for (const session of sessions) {
    const isPast = session.startsAt < new Date();
    // Rotate members through sessions for realistic occupancy (~50-80%)
    const take = Math.min(session.capacity, 3 + (bookingCount % 3));
    for (let i = 0; i < take; i++) {
      const member = members[(bookingCount + i * 3) % members.length];
      const useCredit = i % 4 !== 3; // most pay with credits
      const status: BookingStatus = isPast
        ? i % 5 === 4
          ? "NO_SHOW"
          : "ATTENDED"
        : "BOOKED";
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          memberId: member.id,
          status,
          paidWith: useCredit ? PaymentMethod.CREDIT : PaymentMethod.MOMO,
          amountGHS: useCredit ? 0 : session.priceGHS,
          createdAt: new Date(session.startsAt.getTime() - 1000 * 60 * 60 * 24 * 2),
        },
      });
      if (!useCredit) {
        await prisma.payment.create({
          data: {
            memberId: member.id,
            amountGHS: session.priceGHS,
            method: PaymentMethod.MOMO,
            description: "Drop-in booking",
            status: "CONFIRMED",
            createdAt: new Date(session.startsAt.getTime() - 1000 * 60 * 60 * 24 * 2),
          },
        });
      }
    }
    bookingCount++;
  }

  const counts = {
    users: await prisma.user.count(),
    sessions: await prisma.session.count(),
    bookings: await prisma.booking.count(),
    payments: await prisma.payment.count(),
  };
  console.log("Seed complete:", counts);
  console.log("\nLogins (password for all: password123)");
  console.log("  owner@corestudio.test  — OWNER");
  console.log("  admin@corestudio.test  — ADMIN");
  console.log("  efua@corestudio.test   — TRAINER");
  console.log("  ama@member.test        — MEMBER");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
