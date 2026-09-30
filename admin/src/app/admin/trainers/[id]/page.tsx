import { notFound } from "next/navigation";
import { prisma } from "@backend/lib/prisma";
import { formatGHS } from "@backend/lib/money";
import { TrainerBookingsPanel, type TrainerBookingRow } from "./trainer-bookings-panel";

export const metadata = { title: "Trainer — P4Studio Admin" };
export const dynamic = "force-dynamic";

const BOOKING_LIST_CAP = 300;

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [trainer, bookingAgg, attendedCount, noShowCount, bookings, sessionsCount] = await Promise.all([
    prisma.trainer.findUnique({ where: { id }, include: { user: true } }),
    prisma.booking.aggregate({
      _sum: { amountGHS: true },
      _count: true,
      where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] }, session: { trainerId: id } },
    }),
    prisma.booking.count({ where: { status: "ATTENDED", session: { trainerId: id } } }),
    prisma.booking.count({ where: { status: "NO_SHOW", session: { trainerId: id } } }),
    prisma.booking.findMany({
      where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW", "WAITLIST"] }, session: { trainerId: id } },
      include: {
        member: { include: { user: { select: { name: true } } } },
        session: {
          select: {
            startsAt: true,
            classType: { select: { name: true } },
            location: { select: { name: true } },
          },
        },
      },
      orderBy: { session: { startsAt: "desc" } },
      take: BOOKING_LIST_CAP,
    }),
    prisma.session.count({ where: { trainerId: id } }),
  ]);
  if (!trainer) notFound();

  const rows: TrainerBookingRow[] = bookings.map((b) => ({
    id: b.id,
    status: b.status,
    paidWith: b.paidWith,
    amountGHS: b.amountGHS,
    memberName: b.member.user.name,
    className: b.session.classType?.name ?? "Private class",
    locationName: b.session.location?.name ?? null,
    startsAt: b.session.startsAt.toISOString(),
  }));

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4">
        {trainer.photoUrl ? (
          <img src={trainer.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: trainer.calendarColor }}
          >
            {trainer.user.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{trainer.user.name}</h1>
          <p className="text-sm text-stone-500">
            {trainer.user.email} · {trainer.user.phone} · {trainer.specialty || "No specialty set"}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Sessions taught", String(sessionsCount)],
          ["Total bookings", String(bookingAgg._count)],
          ["Attended", String(attendedCount)],
          ["Revenue", formatGHS(bookingAgg._sum.amountGHS ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-stone-900">{value}</p>
          </div>
        ))}
      </div>
      {noShowCount > 0 && (
        <p className="mt-2 text-xs text-stone-400">{noShowCount} no-show{noShowCount === 1 ? "" : "s"} not counted as attended.</p>
      )}

      <div className="mt-6">
        <TrainerBookingsPanel bookings={rows} />
      </div>
      {bookings.length === BOOKING_LIST_CAP && (
        <p className="mt-2 text-xs text-stone-400">Showing the {BOOKING_LIST_CAP} most recent bookings.</p>
      )}
    </main>
  );
}
