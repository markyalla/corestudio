import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { NewMemberButton } from "./member-forms";

export const metadata = { title: "Members — P4Studio Admin" };
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");
  if (session?.user?.role === "ACCOUNTANT") redirect("/admin/payroll");

  const [members, plans] = await Promise.all([
    prisma.member.findMany({
      include: { user: true, plan: true },
      orderBy: { joinedAt: "desc" },
    }),
    prisma.membershipPlan.findMany({ where: { active: true } }),
  ]);

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Members</h1>
        <NewMemberButton plans={JSON.parse(JSON.stringify(plans))} />
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Classes left</th>
              <th className="px-4 py-3">Wallet</th>
              <th className="px-4 py-3">Renews</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/members/${m.id}`} className="flex items-center gap-2 font-medium text-stone-800 underline-offset-2 hover:underline">
                    {m.photoUrl ? (
                      <img src={m.photoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-xs text-stone-500">
                        {m.user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    {m.user.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-stone-500">
                  {m.user.email}
                  <br />
                  {m.user.phone}
                </td>
                <td className="px-4 py-2.5 text-stone-600">{m.plan?.name ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${m.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : m.status === "FROZEN" ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-500"}`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-stone-600">{m.creditsLeft}</td>
                <td className="px-4 py-2.5 text-stone-600">{formatGHS(m.walletGHS)}</td>
                <td className="px-4 py-2.5 text-stone-400">{m.cycleRenewsAt?.toISOString().slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
