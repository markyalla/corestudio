import Link from "next/link";
import { prisma } from "@backend/lib/prisma";
import { fmtTime, startOfUTCDay } from "@backend/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "CoreStudio Pilates — Accra" };

export default async function Landing() {
  const from = startOfUTCDay(new Date());
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sessions = await prisma.session.findMany({
    where: { startsAt: { gte: from, lt: to }, status: "SCHEDULED", kind: "CLASS" },
    include: { classType: true, trainer: { include: { user: true } } },
    orderBy: { startsAt: "asc" },
  });

  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = s.startsAt.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }

  return (
    <main className="min-h-screen bg-stone-100">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <p className="text-lg font-semibold text-stone-900">CoreStudio</p>
        <div className="flex gap-2">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:text-stone-900">
            Log in
          </Link>
          <Link href="/signup" className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
            Join now
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-10 pt-14 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
          Pilates, made for Accra.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-stone-500">
          Reformer, mat and barre classes with certified instructors. Book from your phone,
          pay with MoMo.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-xl bg-stone-900 px-8 py-3 text-sm font-medium text-white hover:bg-stone-700"
        >
          Start your first class
        </Link>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-16">
        <h2 className="text-lg font-semibold text-stone-900">This week&apos;s timetable</h2>
        <div className="mt-4 space-y-4">
          {[...byDay.entries()].map(([day, list]) => (
            <div key={day} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-stone-900">
                {new Date(day).toLocaleDateString("en-GH", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {list.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-stone-900">{fmtTime(s.startsAt)}</span>
                    <span className="h-6 w-1 rounded-full" style={{ backgroundColor: s.trainer.calendarColor }} />
                    <div>
                      <p className="text-stone-800">{s.classType?.name}</p>
                      <p className="text-xs text-stone-400">{s.trainer.user.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {byDay.size === 0 && (
            <p className="rounded-2xl bg-white p-4 text-sm text-stone-400 shadow-sm">
              Timetable coming soon.
            </p>
          )}
        </div>
      </section>

      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-400">
        CoreStudio Pilates · Accra, Ghana
      </footer>
    </main>
  );
}
