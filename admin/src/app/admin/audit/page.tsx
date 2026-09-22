import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Audit Log — CoreStudio Admin" };
export const dynamic = "force-dynamic";

// Every distinct action string currently written anywhere in backend/src —
// kept as a plain list (not read from the DB) so the filter dropdown always
// offers the full set even before any of a given type has happened yet.
const ACTIONS = [
  "user.login", "user.login_failed", "user.signup", "user.password_reset", "user.profile_update",
  "staff.invite",
  "booking.create", "booking.create_paid", "booking.cancel", "booking.check_in", "booking.no_show",
  "booking.waitlist", "booking.waitlist_promote", "booking.waitlist_offer", "booking.waitlist_offer_expired",
  "booking.waitlist_claimed", "booking.paid_but_full",
  "session.update", "session.cancel", "session.skipped_unavailable_trainer",
  "member.create", "member.update", "member.plan_activated", "member.frozen_unpaid",
  "trainer.create", "trainer.update", "trainer.unavailability_add", "trainer.unavailability_remove",
  "class_type.create", "class_type.update",
  "location.create", "location.update",
  "perk.create", "perk.update",
  "plan.create", "plan.update",
  "studio.update",
  "payment.record_manual", "payment.confirm_cash",
  "payout.create", "payout.mark_paid",
] as const;

const ENTITIES = [
  "User", "Booking", "Session", "Member", "Trainer", "ClassType", "Location",
  "PerkItem", "MembershipPlan", "Studio", "Payment", "Payout",
] as const;

// Entities with an admin detail page worth linking straight to.
const LINKABLE: Record<string, (id: string) => string> = {
  Member: (id) => `/admin/members/${id}`,
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; q?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");
  if (session?.user?.role === "ACCOUNTANT") redirect("/admin/payroll");

  const { entity, action, q, from, to } = await searchParams;

  const where: Prisma.AuditLogWhereInput = {};
  if (entity) where.entity = entity;
  if (action) where.action = action;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lt: new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }
  if (q) {
    where.user = { is: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Audit Log</h1>
      <p className="mt-1 text-sm text-stone-500">
        Every mutation across the web admin and mobile app — logins, bookings, payments, staff/settings
        changes. Showing the latest 200 matching entries.
      </p>

      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm" method="GET">
        <label className="block">
          <span className="text-xs text-stone-500">Entity</span>
          <select name="entity" defaultValue={entity ?? ""} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="">All</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">Action</span>
          <select name="action" defaultValue={action ?? ""} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
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
          <span className="text-xs text-stone-500">Actor</span>
          <input name="q" defaultValue={q ?? ""} placeholder="Name or email…" className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2" />
        </label>
        <button className="rounded-lg bg-stone-900 px-4 py-2 font-medium text-white">Filter</button>
        {(entity || action || q || from || to) && (
          <Link href="/admin/audit" className="rounded-lg border border-stone-300 px-4 py-2 text-stone-600">Clear</Link>
        )}
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const link = LINKABLE[l.entity]?.(l.entityId);
              return (
                <tr key={l.id} className="border-b border-stone-100 align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-stone-400">
                    {l.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2.5 text-stone-700">
                    {l.user ? (
                      <>
                        {l.user.name}
                        <span className="ml-1 text-xs text-stone-400">{l.user.role}</span>
                      </>
                    ) : (
                      <span className="text-stone-400">System</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">{l.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">
                    {link ? (
                      <Link href={link} className="underline-offset-2 hover:underline">{l.entity}</Link>
                    ) : (
                      l.entity
                    )}
                    <span className="ml-1 text-xs text-stone-400">{l.entityId.slice(0, 8)}</span>
                  </td>
                  <td className="max-w-xs px-4 py-2.5 font-mono text-xs text-stone-500">
                    {l.payload ? JSON.stringify(l.payload) : "—"}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400">No audit entries match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
