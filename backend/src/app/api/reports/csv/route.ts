import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

/** CSV export of any core table (admin only). ?table=bookings|payments|members|sessions|payouts */
export const GET = apiHandler(async (req: Request) => {
  await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
  const table = new URL(req.url).searchParams.get("table");

  let rows: Record<string, unknown>[];
  switch (table) {
    case "bookings":
      rows = (
        await prisma.booking.findMany({
          include: {
            member: { include: { user: true } },
            session: { include: { classType: true, trainer: { include: { user: true } } } },
          },
          orderBy: { createdAt: "desc" },
        })
      ).map((b) => ({
        member: b.member.user.name,
        class: b.session.classType?.name ?? "Private class",
        startsAt: b.session.startsAt.toISOString(),
        trainer: b.session.trainer.user.name,
        status: b.status,
        paidWith: b.paidWith ?? "",
        amountGHS: (b.amountGHS / 100).toFixed(2),
        createdAt: b.createdAt.toISOString(),
      }));
      break;
    case "payments":
      rows = (
        await prisma.payment.findMany({
          include: { member: { include: { user: true } } },
          orderBy: { createdAt: "desc" },
        })
      ).map((p) => ({
        member: p.member.user.name,
        description: p.description,
        method: p.method,
        status: p.status,
        amountGHS: (p.amountGHS / 100).toFixed(2),
        paystackRef: p.paystackRef ?? "",
        createdAt: p.createdAt.toISOString(),
      }));
      break;
    case "members":
      rows = (
        await prisma.member.findMany({ include: { user: true, plan: true } })
      ).map((m) => ({
        name: m.user.name,
        email: m.user.email,
        phone: m.user.phone ?? "",
        plan: m.plan?.name ?? "",
        status: m.status,
        creditsLeft: m.creditsLeft,
        walletGHS: (m.walletGHS / 100).toFixed(2),
        cycleRenewsAt: m.cycleRenewsAt?.toISOString() ?? "",
        joinedAt: m.joinedAt.toISOString(),
      }));
      break;
    case "sessions":
      rows = (
        await prisma.session.findMany({
          include: {
            classType: true,
            trainer: { include: { user: true } },
            _count: { select: { bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } } } } },
          },
          orderBy: { startsAt: "desc" },
        })
      ).map((s) => ({
        class: s.classType?.name ?? "Private class",
        trainer: s.trainer.user.name,
        startsAt: s.startsAt.toISOString(),
        durationMins: s.durationMins,
        capacity: s.capacity,
        booked: s._count.bookings,
        priceGHS: (s.priceGHS / 100).toFixed(2),
        status: s.status,
      }));
      break;
    case "payouts":
      rows = (
        await prisma.payout.findMany({
          include: { trainer: { include: { user: true } }, _count: { select: { lines: true } } },
          orderBy: { createdAt: "desc" },
        })
      ).map((p) => ({
        trainer: p.trainer.user.name,
        periodStart: p.periodStart.toISOString().slice(0, 10),
        periodEnd: p.periodEnd.toISOString().slice(0, 10),
        bookings: p._count.lines,
        grossGHS: (p.grossGHS / 100).toFixed(2),
        commissionPercent: p.commissionPercent,
        amountGHS: (p.amountGHS / 100).toFixed(2),
        status: p.status,
        reference: p.reference ?? "",
      }));
      break;
    default:
      throw new ApiError(400, "table must be one of: bookings, payments, members, sessions, payouts");
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
