import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** Bumps tokenVersion, instantly invalidating every mobile bearer token for
 *  this user — including the one used to call this endpoint. Use when a
 *  device is lost/stolen or as a general "log out everywhere" action. */
export const POST = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, "ANY");
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { tokenVersion: { increment: 1 } },
  });
  await audit(prisma, {
    userId: auth.user.id,
    action: "user.logout_all",
    entity: "User",
    entityId: auth.user.id,
  });
  return NextResponse.json({ ok: true });
});
