import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";
import { pickForToday } from "@/lib/motivation";

/** Today's motivation line for the Home screen — one per calendar day,
 *  rotating through the active pool. `text` is null when the pool is empty. */
export const GET = apiHandler(async (req: Request) => {
  await requireMobileAuth(req, ["MEMBER"]);
  const pool = await prisma.motivationMessage.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { text: true },
  });
  return NextResponse.json({ text: pickForToday(pool) });
});
