import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { computeOwedPerTrainer } from "@backend/lib/payouts";

export const metadata = { title: "Dashboard — CoreStudio Admin" };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7)); // Monday
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [revenue30, activeMembers, bookingsThisWeek, attended, noShow, owed, revenuePerTrainer] =
    await Promise.all([
      prisma.payment.aggregate({
        _sum: { amountGHS: true },
        where: { status: "CONFIRMED", createdAt: { gte: d30 } },
      }),
      prisma.member.count({ where: { status: "ACTIVE" } }),
      prisma.booking.count({
        where: {
          status: { in: ["BOOKED", "ATTENDED"] },
          session: { startsAt: { gte: weekStart, lt: weekEnd } },
        },
      }),
      prisma.booking.count({
        where: { status: "ATTENDED", session: { startsAt: { gte: d30 } } },
      }),
      prisma.booking.count({
        where: { status: "NO_SHOW", session: { startsAt: { gte: d30 } } },
      }),
      computeOwedPerTrainer(),
      prisma.$queryRaw<{ name: string; revenue: bigint }[]>`
        SELECT u.name, COALESCE(SUM(b."amountGHS"), 0)::bigint AS revenue
        FROM "Booking" b
        JOIN "Session" s ON s.id = b."sessionId"
        JOIN "Trainer" t ON t.id = s."trainerId"
        JOIN "User" u ON u.id = t."userId"
        WHERE b.status IN ('BOOKED', 'ATTENDED') AND s."startsAt" >= ${d30}
        GROUP BY u.name ORDER BY revenue DESC
      `,
    ]);

  const attendanceRate =
    attended + noShow > 0 ? Math.round((attended / (attended + noShow)) * 100) : null;
  const totalOwed = owed.reduce((sum, o) => sum + o.amountGHS, 0);
  const maxRevenue = Math.max(1, ...revenuePerTrainer.map((r) => Number(r.revenue)));

  const stats: [string, string][] = [
    ["Revenue (30d)", formatGHS(revenue30._sum.amountGHS ?? 0)],
    ["Active members", String(activeMembers)],
    ["Bookings this week", String(bookingsThisWeek)],
    ["Attendance rate (30d)", attendanceRate === null ? "—" : `${attendanceRate}%`],
    ["Payouts owing", formatGHS(totalOwed)],
  ];

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Dashboard</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 max-w-2xl rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-stone-700">Revenue per trainer (30d, drop-ins)</h2>
        <div className="mt-4 space-y-3">
          {revenuePerTrainer.map((r) => (
            <div key={r.name}>
              <div className="mb-1 flex justify-between text-xs text-stone-500">
                <span>{r.name}</span>
                <span>{formatGHS(Number(r.revenue))}</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100">
                <div
                  className="h-2 rounded-full bg-stone-800"
                  style={{ width: `${(Number(r.revenue) / maxRevenue) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {revenuePerTrainer.length === 0 && (
            <p className="text-sm text-stone-400">No revenue in the last 30 days.</p>
          )}
        </div>
      </div>
    </main>
  );
}
