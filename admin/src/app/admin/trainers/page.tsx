import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { NewTrainerButton, TrainerRow } from "./trainer-forms";

export const metadata = { title: "Trainers — P4Studio Admin" };
export const dynamic = "force-dynamic";

export default async function TrainersPage() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");
  if (session?.user?.role === "ACCOUNTANT") redirect("/admin/payroll");

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [trainers, locations] = await Promise.all([
    prisma.trainer.findMany({ include: { user: true } }),
    prisma.location.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows = await Promise.all(
    trainers.map(async (t) => {
      const [sessions30, attended30, revenue] = await Promise.all([
        prisma.session.count({ where: { trainerId: t.id, startsAt: { gte: d30 } } }),
        prisma.booking.count({
          where: { status: "ATTENDED", session: { trainerId: t.id, startsAt: { gte: d30 } } },
        }),
        prisma.booking.aggregate({
          _sum: { amountGHS: true },
          where: {
            status: { in: ["BOOKED", "ATTENDED"] },
            session: { trainerId: t.id, startsAt: { gte: d30 } },
          },
        }),
      ]);
      return {
        id: t.id,
        name: t.user.name,
        email: t.user.email,
        phone: t.user.phone ?? "",
        specialty: t.specialty,
        commissionPercent: t.commissionPercent,
        ptCommissionPercent: t.ptCommissionPercent,
        ptRateGHS: t.ptRateGHS,
        calendarColor: t.calendarColor,
        photoUrl: t.photoUrl,
        sessions30,
        attended30,
        revenue30: formatGHS(revenue._sum.amountGHS ?? 0),
      };
    }),
  );

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Trainers</h1>
        <NewTrainerButton />
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((t) => (
          <TrainerRow key={t.id} trainer={t} locations={locations} />
        ))}
      </div>
    </main>
  );
}
