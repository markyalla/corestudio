import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { computeOwedPerTrainer } from "@backend/lib/payouts";
import { PayoutActions, MarkPaidButton } from "./payout-actions";

export const metadata = { title: "Payouts — P4Studio Admin" };
export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");

  const [owed, history] = await Promise.all([
    computeOwedPerTrainer(),
    prisma.payout.findMany({
      include: { trainer: { include: { user: true } }, _count: { select: { lines: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Payouts</h1>

      <h2 className="mt-6 text-sm font-medium text-stone-700">Currently owing</h2>
      <div className="mt-2 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Trainer</th>
              <th className="px-4 py-3">Eligible bookings</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Commission</th>
              <th className="px-4 py-3 text-right">Owed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {owed.map((o) => (
              <tr key={o.trainerId} className="border-b border-stone-100">
                <td className="px-4 py-2.5 font-medium text-stone-800">{o.trainerName}</td>
                <td className="px-4 py-2.5 text-stone-600">{o.bookingIds.length}</td>
                <td className="px-4 py-2.5 text-stone-500">
                  {o.periodStart
                    ? `${o.periodStart.toISOString().slice(0, 10)} → ${o.periodEnd!.toISOString().slice(0, 10)}`
                    : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-stone-600">{formatGHS(o.grossGHS)}</td>
                <td className="px-4 py-2.5 text-right text-stone-600">{o.commissionPercent}%</td>
                <td className="px-4 py-2.5 text-right font-semibold text-stone-900">{formatGHS(o.amountGHS)}</td>
                <td className="px-4 py-2.5 text-right">
                  {o.amountGHS > 0 && <PayoutActions trainerId={o.trainerId} amount={formatGHS(o.amountGHS)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-sm font-medium text-stone-700">History</h2>
      <div className="mt-2 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Trainer</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Bookings</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {history.map((p) => (
              <tr key={p.id} className="border-b border-stone-100">
                <td className="px-4 py-2.5 text-stone-800">{p.trainer.user.name}</td>
                <td className="px-4 py-2.5 text-stone-500">
                  {p.periodStart.toISOString().slice(0, 10)} → {p.periodEnd.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-2.5 text-stone-600">{p._count.lines}</td>
                <td className="px-4 py-2.5 text-right font-medium text-stone-900">{formatGHS(p.amountGHS)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-stone-400">{p.reference ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    {p.status === "PENDING" && <MarkPaidButton payoutId={p.id} />}
                    <a href={`/api/payouts/${p.id}/pdf`} className="rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:bg-stone-50">
                      PDF
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400">No payouts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
