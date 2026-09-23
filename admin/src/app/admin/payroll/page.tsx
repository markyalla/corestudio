import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { computeStaffOwed } from "@backend/lib/payroll";
import { NewStaffMemberButton, StaffMemberRow, PayAction, MarkPayrollPaidButton } from "./payroll-client";

export const metadata = { title: "Payroll — P4Studio Admin" };
export const dynamic = "force-dynamic";

const POSITION_LABELS: Record<string, string> = {
  SECURITY: "Security",
  SECRETARY: "Secretary",
  CLEANER: "Cleaner",
  OTHER: "Other",
};

export default async function PayrollPage() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");

  const [staff, owed, history] = await Promise.all([
    prisma.staffMember.findMany({ orderBy: { name: "asc" } }),
    computeStaffOwed(),
    prisma.payrollPayment.findMany({
      include: { staffMember: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const owedByStaffId = new Map(owed.map((o) => [o.staffMemberId, o]));

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Payroll</h1>
        <NewStaffMemberButton />
      </div>

      <h2 className="mt-6 text-sm font-medium text-stone-700">Staff</h2>
      <div className="mt-2 space-y-3">
        {staff.map((s) => (
          <StaffMemberRow
            key={s.id}
            staffMember={{
              id: s.id,
              name: s.name,
              phone: s.phone,
              position: s.position,
              positionTitle: s.positionTitle,
              baseSalaryGHS: s.baseSalaryGHS,
              active: s.active,
            }}
            positionLabel={POSITION_LABELS[s.position] ?? s.position}
            owedThisMonth={owedByStaffId.has(s.id)}
          />
        ))}
        {staff.length === 0 && (
          <p className="rounded-2xl bg-white p-5 text-sm text-stone-400 shadow-sm">
            No staff yet — add security, secretary, cleaner or other staff above.
          </p>
        )}
      </div>

      <h2 className="mt-8 text-sm font-medium text-stone-700">Currently owing (this month)</h2>
      <div className="mt-2 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3 text-right">Base salary</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {owed.map((o) => (
              <tr key={o.staffMemberId} className="border-b border-stone-100">
                <td className="px-4 py-2.5 font-medium text-stone-800">{o.name}</td>
                <td className="px-4 py-2.5 text-stone-600">{POSITION_LABELS[o.position] ?? o.position}{o.positionTitle ? ` (${o.positionTitle})` : ""}</td>
                <td className="px-4 py-2.5 text-right text-stone-600">{formatGHS(o.baseSalaryGHS)}</td>
                <td className="px-4 py-2.5 text-right">
                  <PayAction staffMemberId={o.staffMemberId} amount={formatGHS(o.baseSalaryGHS)} />
                </td>
              </tr>
            ))}
            {owed.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-400">Nothing owing this month.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-sm font-medium text-stone-700">History</h2>
      <div className="mt-2 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Base</th>
              <th className="px-4 py-3 text-right">Social security</th>
              <th className="px-4 py-3 text-right">Net paid</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {history.map((p) => (
              <tr key={p.id} className="border-b border-stone-100">
                <td className="px-4 py-2.5 text-stone-800">{p.staffMember.name}</td>
                <td className="px-4 py-2.5 text-stone-500">
                  {p.periodStart.toISOString().slice(0, 10)} → {p.periodEnd.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-2.5 text-right text-stone-600">{formatGHS(p.baseSalaryGHS)}</td>
                <td className="px-4 py-2.5 text-right text-stone-600">{formatGHS(p.socialSecurityGHS)} ({p.socialSecurityPercent}%)</td>
                <td className="px-4 py-2.5 text-right font-medium text-stone-900">{formatGHS(p.netGHS)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-stone-400">{p.reference ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  {p.status === "PENDING" && <MarkPayrollPaidButton payrollPaymentId={p.id} />}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-stone-400">No payroll payments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
