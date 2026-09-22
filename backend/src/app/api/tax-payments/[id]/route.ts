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

    const existing = await prisma.taxPayment.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Tax payment not found");
    if (existing.status === "PAID") throw new ApiError(400, "Already paid");

    const payment = await prisma.$transaction(async (tx) => {
      const payment = await tx.taxPayment.update({
        where: { id },
        data: { status: "PAID", paidAt: new Date(), reference: body.reference },
      });
      await audit(tx, {
        userId: session.user.id,
        action: "tax_payment.mark_paid",
        entity: "TaxPayment",
        entityId: id,
        payload: { reference: body.reference },
      });
      return payment;
    });

    return NextResponse.json({ payment });
  },
);
