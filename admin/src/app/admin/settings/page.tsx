import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings — P4Studio Admin" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user?.role === "TRAINER") redirect("/admin/timetable");
  if (session?.user?.role === "ACCOUNTANT") redirect("/admin/payroll");

  const [studio, plans, classTypes, packages, locations, perks, announcements, motivationMessages] = await Promise.all([
    prisma.studio.findFirstOrThrow(),
    prisma.membershipPlan.findMany({ orderBy: { priceGHS: "asc" }, include: { perks: true } }),
    prisma.classType.findMany({ orderBy: { name: "asc" } }),
    prisma.package.findMany({ orderBy: { name: "asc" }, include: { classType: { select: { name: true } }, perks: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.perkItem.findMany({ orderBy: { name: "asc" } }),
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.motivationMessage.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <SettingsClient
      isOwner={session?.user?.role === "OWNER"}
      isAdmin={session?.user?.role === "ADMIN"}
      studio={JSON.parse(JSON.stringify(studio))}
      plans={JSON.parse(JSON.stringify(plans))}
      classTypes={JSON.parse(JSON.stringify(classTypes))}
      packages={JSON.parse(JSON.stringify(packages))}
      locations={JSON.parse(JSON.stringify(locations))}
      perks={JSON.parse(JSON.stringify(perks))}
      announcements={JSON.parse(JSON.stringify(announcements))}
      motivationMessages={JSON.parse(JSON.stringify(motivationMessages))}
    />
  );
}
