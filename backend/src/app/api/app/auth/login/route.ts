import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, ApiError } from "@/lib/rbac";
import { verifyCredentials } from "@/lib/verify-credentials";
import { issueMobileToken } from "@/lib/mobile-auth";

/** Mobile login: email+password → bearer JWT (no session cookie involved). */
export const POST = apiHandler(async (req: Request) => {
  const user = await verifyCredentials(await req.json(), "mobile");
  if (!user) throw new ApiError(401, "Invalid email or password");

  const member = await prisma.member.findFirst({ where: { userId: user.id } });

  const token = await issueMobileToken({
    userId: user.id,
    role: user.role,
    memberId: member?.id ?? null,
    tokenVersion: user.tokenVersion,
  });

  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});
