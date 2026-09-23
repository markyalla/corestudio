import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import {
  NewSocialSecurityButton, MarkSocialSecurityPaidButton,
  NewTaxPaymentButton, MarkTaxPaymentPaidButton,
} from "./tax-client";

export const metadata = { title: "Tax & Social Security — P4Studio Admin" };
export const dynamic = "force-dynamic";

export default async function TaxPage() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7)); // Monday
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [weekRevenue, monthRevenue, yearRevenue, ssWithheldThisMonth, ssHistory, taxHistory] =
    await Promise.all([
      prisma.payment.aggregate({ _sum: { amountGHS: true }, where: { status: "CONFIRMED", createdAt: { gte: weekStart } } }),
      prisma.payment.aggregate({ _sum: { amountGHS: true }, where: { status: "CONFIRMED", createdAt: { gte: monthStart } } }),
      prisma.payment.aggregate({ _sum: { amountGHS: true }, where: { status: "CONFIRMED", createdAt: { gte: yearStart } } }),
      prisma.payrollPayment.aggregate({ _sum: { socialSecurityGHS: true }, where: { createdAt: { gte: monthStart } } }),
      prisma.socialSecurityRemittance.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.taxPayment.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    ]);

  const stats: [string, string][] = [
    ["Income this week", formatGHS(weekRevenue._sum.amountGHS ?? 0)],
    ["Income this month", formatGHS(monthRevenue._sum.amountGHS ?? 0)],
    ["Income this year", formatGHS(yearRevenue._sum.amountGHS ?? 0)],
  ];

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Tax & Social Security</h1>

      <div className="mt-6 grid grid-cols-3 gap-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-medium text-stone-700">
          Social security — withheld this month: {formatGHS(ssWithheldThisMonth._sum.socialSecurityGHS ?? 0)}
        </h2>
        <NewSocialSecurityButton suggestedAmountGHS={ssWithheldThisMonth._sum.socialSecurityGHS ?? 0} />
      </div>
      <div className="mt-2 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {ssHistory.map((r) => (
              <tr key={r.id} className="border-b border-stone-100">
                <td className="px-4 py-2.5 text-stone-500">{r.periodStart.toISOString().slice(0, 10)} → {r.periodEnd.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-stone-900">{formatGHS(r.amountGHS)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{r.status}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-stone-400">{r.reference ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.status === "PENDING" && <MarkSocialSecurityPaidButton remittanceId={r.id} />}
                </td>
              </tr>
            ))}
            {ssHistory.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400">No remittances yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-medium text-stone-700">Taxes</h2>
        <NewTaxPaymentButton />
      </div>
      <div className="mt-2 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {taxHistory.map((t) => (
              <tr key={t.id} className="border-b border-stone-100">
                <td className="px-4 py-2.5 text-stone-800">{t.type}</td>
                <td className="px-4 py-2.5 text-stone-500">{t.periodStart.toISOString().slice(0, 10)} → {t.periodEnd.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-stone-900">{formatGHS(t.amountGHS)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${t.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{t.status}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-stone-400">{t.reference ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  {t.status === "PENDING" && <MarkTaxPaymentPaidButton taxPaymentId={t.id} />}
                </td>
              </tr>
            ))}
            {taxHistory.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">No tax payments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
