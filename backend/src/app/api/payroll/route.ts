import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, requireRole } from "@/lib/rbac";
import { createPayrollPayment } from "@/lib/payroll";

const schema = z.object({ staffMemberId: z.string().min(1) });

/** Creates this month's PayrollPayment for a staff member. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
  const { staffMemberId } = schema.parse(await req.json());
  const payment = await createPayrollPayment({ staffMemberId, actorUserId: session.user.id });
  return NextResponse.json({ payment }, { status: 201 });
});
