import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";

/** Active studio locations a member can choose from as their preferred
 *  location (see /api/app/profile PATCH). */
export const GET = apiHandler(async (req: Request) => {
  await requireMobileAuth(req, ["MEMBER"]);
  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    locations: locations.map((l) => ({ id: l.id, name: l.name, address: l.address })),
  });
});
