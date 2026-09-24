import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { redirect } from "next/navigation";
import { RequestsInbox } from "./requests-inbox";

export const metadata = { title: "Trainer requests — P4Studio Admin" };
export const dynamic = "force-dynamic";

/** OWNER/ADMIN inbox for trainer-filed requests (cancel a class / heads-up
 *  they won't be available). See TrainerRequestsPage (admin/requests) for
 *  the trainer-facing side that creates these. */
export default async function TrainerRequestsInboxPage() {
  const session = await auth();
  if (session?.user?.role !== "OWNER" && session?.user?.role !== "ADMIN") redirect("/admin");

  const requests = await prisma.trainerRequest.findMany({
    include: {
      trainer: { select: { id: true, user: { select: { name: true } } } },
      session: { select: { id: true, startsAt: true, status: true, classType: { select: { name: true } } } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Trainer requests</h1>
      <p className="mt-1 text-sm text-stone-500">
        Cancellation requests and unavailability heads-up from trainers. Cancelling a class here
        refunds and notifies every member who booked it.
      </p>
      <section className="mt-6">
        <RequestsInbox requests={JSON.parse(JSON.stringify(requests))} />
      </section>
    </main>
  );
}
