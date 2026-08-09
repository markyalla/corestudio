import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { redirect } from "next/navigation";
import { AvailabilityPanel } from "./availability-panel";

export const metadata = { title: "My availability — CoreStudio Admin" };
export const dynamic = "force-dynamic";

export default async function MyAvailabilityPage() {
  const session = await auth();
  if (session?.user?.role !== "TRAINER") redirect("/admin");

  const trainer = await prisma.trainer.findFirst({ where: { userId: session.user.id } });
  if (!trainer) redirect("/admin");

  return (
    <main className="max-w-2xl p-8">
      <h1 className="text-2xl font-semibold text-stone-900">My availability</h1>
      <p className="mt-1 text-sm text-stone-500">
        Mark the days you can&apos;t teach — admins won&apos;t be able to assign you a class on those dates.
      </p>
      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <AvailabilityPanel trainerId={trainer.id} />
      </section>
    </main>
  );
}
