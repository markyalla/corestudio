import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { redirect } from "next/navigation";
import { RequestForm } from "./request-form";
import { TrainerPhotoUpload } from "./trainer-photo-upload";

export const metadata = { title: "Requests — P4Studio Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Waiting for staff",
  APPROVED: "Class cancelled",
  DISMISSED: "Dismissed",
};

/** Trainer-facing: file a scheduling request instead of editing the
 *  calendar directly (trainers no longer manage their own unavailability or
 *  private-class windows — see TrainerRequest). */
export default async function TrainerRequestsPage() {
  const session = await auth();
  if (session?.user?.role !== "TRAINER") redirect("/admin");

  const trainer = await prisma.trainer.findFirst({ where: { userId: session.user.id } });
  if (!trainer) redirect("/admin");

  const [upcomingSessions, requests] = await Promise.all([
    prisma.session.findMany({
      where: { trainerId: trainer.id, status: "SCHEDULED", startsAt: { gte: new Date() } },
      include: { classType: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
    prisma.trainerRequest.findMany({
      where: { trainerId: trainer.id },
      include: { session: { select: { startsAt: true, classType: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <main className="max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Requests</h1>
      <p className="mt-1 text-sm text-stone-500">
        Your calendar is set by staff — if a class needs to be cancelled, or you won&apos;t be
        available at a time, let the admin or owner know here. They&apos;ll cancel it if it works
        for the studio, and members will be notified to reschedule.
      </p>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-stone-700">Your photo</h2>
        <p className="mt-1 text-xs text-stone-400">
          Shown to members on every class and private session you teach.
        </p>
        <div className="mt-3">
          <TrainerPhotoUpload trainerId={trainer.id} photoUrl={trainer.photoUrl} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <RequestForm
          sessions={JSON.parse(
            JSON.stringify(
              upcomingSessions.map((s) => ({
                id: s.id,
                startsAt: s.startsAt,
                className: s.classType?.name ?? "Private class",
              })),
            ),
          )}
        />
      </section>

      <h2 className="mt-8 text-lg font-semibold text-stone-900">Your requests</h2>
      <section className="mt-4 space-y-2">
        {requests.length === 0 && <p className="text-sm text-stone-400">Nothing sent yet.</p>}
        {requests.map((r) => (
          <div key={r.id} className="rounded-xl bg-white p-4 text-sm shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-stone-800">
                  {r.type === "CANCEL_SESSION" ? "Cancel a class" : "Won't be available"}
                  {r.session && (
                    <span className="font-normal text-stone-500">
                      {" — "}
                      {r.session.classType?.name ?? "Private class"} ·{" "}
                      {new Date(r.session.startsAt).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-stone-600">{r.message}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  r.status === "PENDING"
                    ? "bg-amber-50 text-amber-700"
                    : r.status === "APPROVED"
                      ? "bg-red-50 text-red-700"
                      : "bg-stone-100 text-stone-500"
                }`}
              >
                {STATUS_LABEL[r.status]}
              </span>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
