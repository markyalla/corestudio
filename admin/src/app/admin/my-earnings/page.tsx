import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { computeOwedPerTrainer } from "@backend/lib/payouts";

export const metadata = { title: "My earnings — CoreStudio" };
export const dynamic = "force-dynamic";

/** Trainer-only view: accrued earnings and payout history. */
export default async function MyEarningsPage() {
  const session = await auth();
  const trainer = await prisma.trainer.findFirst({
    where: { userId: session!.user.id },
    include: { user: true },
  });
  if (!trainer) redirect("/admin");

  const [owedAll, payouts] = await Promise.all([
    computeOwedPerTrainer(),
    prisma.payout.findMany({
      where: { trainerId: trainer.id },
      include: { _count: { select: { lines: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const owed = owedAll.find((o) => o.trainerId === trainer.id);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-stone-900">My earnings</h1>
      <div className="mt-6 grid max-w-lg grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs text-stone-500">Accrued (not yet paid out)</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">{formatGHS(owed?.amountGHS ?? 0)}</p>
          <p className="mt-1 text-xs text-stone-400">
            {owed?.bookingIds.length ?? 0} bookings · {trainer.commissionPercent}% group · {trainer.ptCommissionPercent}% private
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs text-stone-500">Paid out to date</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">
            {formatGHS(payouts.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountGHS, 0))}
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-medium text-stone-700">Payout history</h2>
      <div className="mt-2 max-w-2xl overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-2.5 text-stone-600">
                  {p.periodStart.toISOString().slice(0, 10)} → {p.periodEnd.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-2.5 text-stone-500">{p._count.lines} bookings</td>
                <td className="px-4 py-2.5 font-medium text-stone-900">{formatGHS(p.amountGHS)}</td>
                <td className="px-4 py-2.5">{p.status}</td>
                <td className="px-4 py-2.5 text-right">
                  <a href={`/api/payouts/${p.id}/pdf`} className="text-xs text-stone-500 underline">PDF</a>
                </td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr><td className="px-4 py-6 text-stone-400">No payouts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
