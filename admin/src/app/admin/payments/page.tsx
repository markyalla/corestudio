import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { RecordPaymentButton } from "./record-payment";
import { ConfirmCashButton } from "./confirm-cash-button";
import type { PaymentStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Payments — P4Studio Admin" };
export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "CONFIRMED", "FAILED"] as const;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; method?: string; q?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");

  const { status, method, q } = await searchParams;

  const where: Prisma.PaymentWhereInput = {};
  if (status && STATUSES.includes(status as PaymentStatus)) where.status = status as PaymentStatus;
  if (method) where.method = method as Prisma.PaymentWhereInput["method"];
  if (q) where.member = { user: { name: { contains: q, mode: "insensitive" } } };

  const [payments, members] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { member: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.member.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Payments</h1>
        <RecordPaymentButton
          members={JSON.parse(JSON.stringify(members.map((m) => ({ id: m.id, name: m.user.name }))))}
        />
      </div>

      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm" method="GET">
        <label className="block">
          <span className="text-xs text-stone-500">Status</span>
          <select name="status" defaultValue={status ?? ""} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">Method</span>
          <select name="method" defaultValue={method ?? ""} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="">All</option>
            {["MOMO", "CARD", "CASH"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">Member</span>
          <input name="q" defaultValue={q ?? ""} placeholder="Name…" className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2" />
        </label>
        <button className="rounded-lg bg-stone-900 px-4 py-2 font-medium text-white">Filter</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Paystack ref</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-stone-100">
                <td className="px-4 py-2.5 text-stone-800">{p.member.user.name}</td>
                <td className="px-4 py-2.5 text-stone-600">{p.description || "—"}</td>
                <td className="px-4 py-2.5 text-stone-600">{p.method}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-stone-400">{p.paystackRef ?? "manual"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      p.status === "CONFIRMED"
                        ? "bg-emerald-50 text-emerald-700"
                        : p.status === "PENDING"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-600"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-stone-900">{formatGHS(p.amountGHS)}</td>
                <td className="px-4 py-2.5 text-stone-400">{p.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-2.5 text-right">
                  {p.method === "CASH" && p.status === "PENDING" && <ConfirmCashButton paymentId={p.id} />}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-stone-400">No payments match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
