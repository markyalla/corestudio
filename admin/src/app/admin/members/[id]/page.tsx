import { notFound } from "next/navigation";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { MemberEditPanel } from "../member-forms";

export const metadata = { title: "Member — P4Studio Admin" };
export const dynamic = "force-dynamic";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [member, plans] = await Promise.all([
    prisma.member.findUnique({
      where: { id },
      include: {
        user: true,
        plan: true,
        bookings: {
          include: { session: { include: { classType: true, trainer: { include: { user: true } } } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        payments: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    }),
    prisma.membershipPlan.findMany({ where: { active: true } }),
  ]);
  if (!member) notFound();

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4">
        {member.photoUrl ? (
          <img src={member.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-200 text-lg text-stone-500">
            {member.user.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{member.user.name}</h1>
          <p className="text-sm text-stone-500">
            {member.user.email} · {member.user.phone} · joined {member.joinedAt.toISOString().slice(0, 10)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Plan", member.plan?.name ?? "—"],
              ["Status", member.status],
              ["Classes left", String(member.creditsLeft)],
              ["Wallet", formatGHS(member.walletGHS)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs text-stone-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-stone-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-medium text-stone-700">Booking history</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-stone-400">
                  <tr>
                    <th className="py-1.5">Session</th>
                    <th className="py-1.5">Trainer</th>
                    <th className="py-1.5">Status</th>
                    <th className="py-1.5">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {member.bookings.map((b) => (
                    <tr key={b.id} className="border-t border-stone-100">
                      <td className="py-2 whitespace-nowrap text-stone-700">
                        {b.session.classType?.name ?? "Private class"} · {b.session.startsAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="py-2 whitespace-nowrap text-stone-500">{b.session.trainer.user.name}</td>
                      <td className="py-2 whitespace-nowrap">{b.status}</td>
                      <td className="py-2 whitespace-nowrap text-stone-500">
                        {b.paidWith ?? "—"}{b.amountGHS > 0 && ` · ${formatGHS(b.amountGHS)}`}
                      </td>
                    </tr>
                  ))}
                  {member.bookings.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-stone-400">No bookings.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-medium text-stone-700">Payments</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody>
                  {member.payments.map((p) => (
                    <tr key={p.id} className="border-t border-stone-100">
                      <td className="py-2 whitespace-nowrap text-stone-700">{p.description || p.method}</td>
                      <td className="py-2 whitespace-nowrap text-stone-500">{p.method} · {p.status}</td>
                      <td className="py-2 whitespace-nowrap text-right font-medium text-stone-800">{formatGHS(p.amountGHS)}</td>
                      <td className="py-2 pl-4 whitespace-nowrap text-stone-400">{p.createdAt.toISOString().slice(0, 10)}</td>
                    </tr>
                  ))}
                  {member.payments.length === 0 && (
                    <tr><td className="py-4 text-stone-400">No payments.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <MemberEditPanel
          memberId={member.id}
          current={{ planId: member.planId, status: member.status, creditsLeft: member.creditsLeft }}
          plans={JSON.parse(JSON.stringify(plans))}
        />
      </div>
    </main>
  );
}
