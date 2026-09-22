import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { createMemberSchema } from "@/lib/validation";

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createMemberSchema.parse(await req.json());

  const plan = body.planId
    ? await prisma.membershipPlan.findUnique({ where: { id: body.planId } })
    : null;

  const member = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 10),
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

  return NextResponse.json({ member }, { status: 201 });
});
