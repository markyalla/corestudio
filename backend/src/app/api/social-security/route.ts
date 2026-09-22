import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  amountGHS: z.number().int().min(0),
});

/** Logs a pending social-security remittance for a period (record-keeping only). */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
  const body = schema.parse(await req.json());

  const remittance = await prisma.$transaction(async (tx) => {
    const remittance = await tx.socialSecurityRemittance.create({
      data: { ...body, status: "PENDING" },
    });
    await audit(tx, {
      userId: session.user.id,
      action: "social_security.create",
      entity: "SocialSecurityRemittance",
      entityId: remittance.id,
      payload: { amountGHS: body.amountGHS },
    });
    return remittance;
  });

  return NextResponse.json({ remittance }, { status: 201 });
});
