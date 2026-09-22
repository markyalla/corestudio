import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  type: z.string().min(1).max(100),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  amountGHS: z.number().int().min(0),
});

/** Logs a pending tax payment (e.g. VAT, income tax) from studio revenue — record-keeping only. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
  const body = schema.parse(await req.json());

  const payment = await prisma.$transaction(async (tx) => {
    const payment = await tx.taxPayment.create({
      data: { ...body, status: "PENDING", createdByUserId: session.user.id },
    });
    await audit(tx, {
      userId: session.user.id,
      action: "tax_payment.create",
      entity: "TaxPayment",
      entityId: payment.id,
      payload: { type: body.type, amountGHS: body.amountGHS },
    });
    return payment;
  });

  return NextResponse.json({ payment }, { status: 201 });
});
