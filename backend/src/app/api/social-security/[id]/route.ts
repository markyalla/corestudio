import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  action: z.literal("MARK_PAID"),
  reference: z.string().min(1, "Transfer reference is required"),
});

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const existing = await prisma.socialSecurityRemittance.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Remittance not found");
    if (existing.status === "PAID") throw new ApiError(400, "Already paid");

    const remittance = await prisma.$transaction(async (tx) => {
      const remittance = await tx.socialSecurityRemittance.update({
        where: { id },
        data: { status: "PAID", paidAt: new Date(), reference: body.reference },
      });
      await audit(tx, {
        userId: session.user.id,
        action: "social_security.mark_paid",
        entity: "SocialSecurityRemittance",
        entityId: id,
        payload: { reference: body.reference },
      });
      return remittance;
    });

    return NextResponse.json({ remittance });
  },
);
