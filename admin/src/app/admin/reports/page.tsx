import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { LocationReport, type LocationReportGroup } from "./location-report";

export const metadata = { title: "Reports — P4Studio Admin" };
export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Groups the last 30 days' bookings by location, then by class + trainer —
 *  who booked, who attended, and what it brought in. */
function buildLocationReport(
  bookings: {
    status: string;
    amountGHS: number;
    member: { user: { name: string } };
    session: {
      classType: { name: string } | null;
      trainer: { id: string; user: { name: string } };
      location: { id: string; name: string } | null;
    };
  }[],
): LocationReportGroup[] {
  const locations = new Map<string, { name: string; classes: Map<string, LocationReportGroup["classes"][number]> }>();

  for (const b of bookings) {
    const locId = b.session.location?.id ?? "none";
    const locName = b.session.location?.name ?? "No location set";
    if (!locations.has(locId)) locations.set(locId, { name: locName, classes: new Map() });
    const loc = locations.get(locId)!;

    const className = b.session.classType?.name ?? "Private class";
    const key = `${className}::${b.session.trainer.id}`;
    if (!loc.classes.has(key)) {
      loc.classes.set(key, {
        key,
        className,
        trainerName: b.session.trainer.user.name,
        bookedCount: 0,
        attendedCount: 0,
        noShowCount: 0,
        revenueGHS: 0,
        members: [],
      });
    }
    const group = loc.classes.get(key)!;
    group.bookedCount += 1;
    if (b.status === "ATTENDED") group.attendedCount += 1;
    if (b.status === "NO_SHOW") group.noShowCount += 1;
    group.revenueGHS += b.amountGHS;
    group.members.push({ name: b.member.user.name, status: b.status });
  }

  return Array.from(locations.entries())
    .map(([locationId, loc]) => ({
      locationId,
      locationName: loc.name,
      classes: Array.from(loc.classes.values()).sort(
        (a, b) => a.className.localeCompare(b.className) || a.trainerName.localeCompare(b.trainerName),
      ),
    }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName));
}

export default async function ReportsPage() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");
  if (session?.user?.role === "ACCOUNTANT") redirect("/admin/payroll");

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [byClassType, heat, attended, noShow, locationBookings] = await Promise.all([
    prisma.$queryRaw<{ name: string; attended: bigint; noshow: bigint; booked: bigint }[]>`
      SELECT ct.name,
             COUNT(*) FILTER (WHERE b.status = 'ATTENDED') AS attended,
             COUNT(*) FILTER (WHERE b.status = 'NO_SHOW') AS noshow,
             COUNT(*) FILTER (WHERE b.status IN ('BOOKED', 'ATTENDED', 'NO_SHOW')) AS booked
      FROM "Booking" b
      JOIN "Session" s ON s.id = b."sessionId"
      JOIN "ClassType" ct ON ct.id = s."classTypeId"
      WHERE s."startsAt" >= ${d30}
      GROUP BY ct.name ORDER BY booked DESC
    `,
    prisma.$queryRaw<{ dow: number; hour: number; n: bigint }[]>`
      SELECT EXTRACT(ISODOW FROM s."startsAt")::int AS dow,
             EXTRACT(HOUR FROM s."startsAt")::int AS hour,
             COUNT(*) AS n
      FROM "Booking" b
      JOIN "Session" s ON s.id = b."sessionId"
      WHERE b.status IN ('BOOKED', 'ATTENDED') AND s."startsAt" >= ${d30}
      GROUP BY 1, 2
    `,
    prisma.booking.count({ where: { status: "ATTENDED", session: { startsAt: { gte: d30 } } } }),
    prisma.booking.count({ where: { status: "NO_SHOW", session: { startsAt: { gte: d30 } } } }),
    prisma.booking.findMany({
      where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] }, session: { startsAt: { gte: d30 } } },
      select: {
        status: true,
        amountGHS: true,
        member: { select: { user: { select: { name: true } } } },
        session: {
          select: {
            classType: { select: { name: true } },
            trainer: { select: { id: true, user: { select: { name: true } } } },
            location: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const locationReport = buildLocationReport(locationBookings);

  const heatMap = new Map<string, number>();
  let heatMax = 1;
  for (const h of heat) {
    const n = Number(h.n);
    heatMap.set(`${h.dow}-${h.hour}`, n);
    heatMax = Math.max(heatMax, n);
  }
  const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const noShowRate = attended + noShow > 0 ? Math.round((noShow / (attended + noShow)) * 100) : 0;

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Reports</h1>
      <p className="mt-1 text-sm text-stone-500">Last 30 days</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-stone-700">Attendance by class type</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-stone-400">
                <tr>
                  <th className="py-1.5 whitespace-nowrap">Class</th>
                  <th className="py-1.5 text-right whitespace-nowrap">Bookings</th>
                  <th className="py-1.5 text-right whitespace-nowrap">Attended</th>
                  <th className="py-1.5 text-right whitespace-nowrap">No-shows</th>
                  <th className="py-1.5 text-right whitespace-nowrap">Rate</th>
                </tr>
              </thead>
              <tbody>
                {byClassType.map((c) => {
                  const total = Number(c.attended) + Number(c.noshow);
                  return (
                    <tr key={c.name} className="border-t border-stone-100">
                      <td className="py-2 whitespace-nowrap text-stone-800">{c.name}</td>
                      <td className="py-2 text-right whitespace-nowrap text-stone-600">{Number(c.booked)}</td>
                      <td className="py-2 text-right whitespace-nowrap text-stone-600">{Number(c.attended)}</td>
                      <td className="py-2 text-right whitespace-nowrap text-stone-600">{Number(c.noshow)}</td>
                      <td className="py-2 text-right whitespace-nowrap font-medium text-stone-900">
                        {total > 0 ? `${Math.round((Number(c.attended) / total) * 100)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 border-t border-stone-100 pt-3 text-sm text-stone-600">
            Overall no-show rate: <span className="font-semibold text-stone-900">{noShowRate}%</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-stone-700">Peak hours (bookings)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="pr-2" />
                  {hours.map((h) => (
                    <th key={h} className="px-0.5 pb-1 font-normal text-stone-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, i) => (
                  <tr key={day}>
                    <td className="pr-2 text-stone-500">{day}</td>
                    {hours.map((h) => {
                      const n = heatMap.get(`${i + 1}-${h}`) ?? 0;
                      return (
                        <td key={h} className="p-0.5">
                          <div
                            title={`${day} ${h}:00 — ${n} bookings`}
                            className="h-6 w-6 rounded"
                            style={{
                              backgroundColor:
                                n === 0 ? "#f5f5f4" : `rgba(28, 25, 23, ${0.15 + 0.85 * (n / heatMax)})`,
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-stone-900">By location</h2>
      <p className="mt-1 text-sm text-stone-500">
        Every class taught at each location in the last 30 days, with its trainer, who booked it,
        who attended, and the revenue it brought in.
      </p>
      <LocationReport locations={locationReport} />

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-stone-700">CSV export</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {["bookings", "payments", "members", "sessions", "payouts"].map((t) => (
            <a
              key={t}
              href={`/api/reports/csv?table=${t}`}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              {t}.csv
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
