import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { createMemberSchema } from "@/lib/validation";
import { getNotificationService } from "@/lib/notifications";

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createMemberSchema.parse(await req.json());

  const plan = body.planId
    ? await prisma.membershipPlan.findUnique({ where: { id: body.planId } })
    : null;

  // No password typed at the front desk → generate one and text it, same
  // pattern as staff invites (backend/src/app/api/staff/route.ts) — never
  // fall back to a fixed default password.
  const tempPassword = body.password ?? crypto.randomBytes(6).toString("base64url");

  const member = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        role: "MEMBER",
      },
    });
    const member = await tx.member.create({
      data: {
        userId: user.id,
        planId: plan?.id ?? null,
        creditsLeft: plan ? plan.classesPerCycle + plan.bonusCredits : 0,
        cycleRenewsAt: plan
          ? new Date(Date.now() + plan.cycleDays * 24 * 60 * 60 * 1000)
          : null,
      },
    });
    await audit(tx, {
      userId: session.user.id,
      action: "member.create",
      entity: "Member",
      entityId: member.id,
      payload: { email: body.email, planId: plan?.id ?? null },
    });
    return member;
  });

  if (!body.password) {
    await getNotificationService().sendSms(
      body.phone,
      `Welcome to CoreStudio! Log in with ${body.email} and temporary password: ${tempPassword}`,
    );
  }

  return NextResponse.json({ member }, { status: 201 });
});
