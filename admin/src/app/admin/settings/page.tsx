import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings — CoreStudio Admin" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");

  const [studio, plans, classTypes, locations, perks] = await Promise.all([
    prisma.studio.findFirstOrThrow(),
    prisma.membershipPlan.findMany({ orderBy: { priceGHS: "asc" }, include: { perks: true } }),
    prisma.classType.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.perkItem.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <SettingsClient
      isOwner={session?.user?.role === "OWNER"}
      studio={JSON.parse(JSON.stringify(studio))}
      plans={JSON.parse(JSON.stringify(plans))}
      classTypes={JSON.parse(JSON.stringify(classTypes))}
      locations={JSON.parse(JSON.stringify(locations))}
      perks={JSON.parse(JSON.stringify(perks))}
    />
  );
}
