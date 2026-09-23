import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import type { BookingStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Bookings — P4Studio Admin" };
export const dynamic = "force-dynamic";

const STATUSES = ["BOOKED", "WAITLIST", "ATTENDED", "NO_SHOW", "CANCELLED"] as const;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; q?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");
  if (session?.user?.role === "ACCOUNTANT") redirect("/admin/payroll");

  const { status, from, to, q } = await searchParams;

  const where: Prisma.BookingWhereInput = {};
  if (status && STATUSES.includes(status as BookingStatus)) {
    where.status = status as BookingStatus;
  }
  if (from || to) {
    where.session = {
      startsAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) } : {}),
      },
    };
  }
  if (q) where.member = { user: { name: { contains: q, mode: "insensitive" } } };

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      member: { include: { user: true } },
      session: { include: { classType: true, trainer: { include: { user: true } } } },
      payment: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Bookings</h1>

      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm" method="GET">
        <label className="block">
          <span className="text-xs text-stone-500">Status</span>
          <select name="status" defaultValue={status ?? ""} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">From</span>
          <input type="date" name="from" defaultValue={from ?? ""} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">To</span>
          <input type="date" name="to" defaultValue={to ?? ""} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2" />
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
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Trainer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Paid with</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Booked at</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-stone-100">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/members/${b.memberId}`} className="text-stone-800 underline-offset-2 hover:underline">
                    {b.member.user.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-stone-600">
                  {b.session.classType?.name ?? "Private class"} · {b.session.startsAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-2.5 text-stone-600">{b.session.trainer.user.name}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">{b.status}</span>
                  {b.status === "BOOKED" && b.payment?.status === "PENDING" && (
                    <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      Payment pending
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-stone-600">{b.paidWith ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-600">{b.amountGHS > 0 ? formatGHS(b.amountGHS) : "—"}</td>
                <td className="px-4 py-2.5 text-stone-400">{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400">No bookings match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
