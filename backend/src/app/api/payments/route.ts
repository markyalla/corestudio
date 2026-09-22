import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  memberId: z.string().min(1),
  amountGHS: z.number().int().positive(), // pesewas
  method: z.enum(["CASH", "MOMO", "CARD"]),
  description: z.string().default(""),
});

/** Record a manual payment taken at the front desk. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
  const body = schema.parse(await req.json());

  const payment = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        memberId: body.memberId,
        amountGHS: body.amountGHS,
        method: body.method,
        description: body.description,
        status: "CONFIRMED",
      },
    });
    await audit(tx, {
      userId: session.user.id,
      action: "payment.record_manual",
      entity: "Payment",
      entityId: payment.id,
      payload: { amountGHS: body.amountGHS, method: body.method },
    });
    return payment;
  });

  return NextResponse.json({ payment }, { status: 201 });
});
