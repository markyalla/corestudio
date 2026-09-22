import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";

/** Active, non-expired announcements & promotions for the app Home screen. */
export const GET = apiHandler(async (req: Request) => {
  await requireMobileAuth(req, ["MEMBER"]);
  const announcements = await prisma.announcement.findMany({
    where: { active: true, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    announcements: announcements.map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl,
      createdAt: a.createdAt,
    })),
  });
});
