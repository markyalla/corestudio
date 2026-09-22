import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { computeProgress } from "@/lib/progress";

/** The member's attendance progress + a tiered encouragement/advice message
 *  for the Home screen. */
export const GET = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const member = await prisma.member.findFirst({ where: { userId: auth.user.id } });
  if (!member) throw new ApiError(404, "No member profile for this account");

  return NextResponse.json(await computeProgress(member.id));
});
