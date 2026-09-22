import { NextResponse } from "next/server";
import { apiHandler, requireRole } from "@/lib/rbac";
import { confirmCashPayment } from "@/lib/payment-flows";

/** Staff confirms a member paid a pending cash payment in person — flips it
 *  to CONFIRMED and, if it's for a plan, activates the plan (adds credits). */
export const POST = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
    const { id } = await ctx.params;

    const outcome = await confirmCashPayment({ paymentId: id, actorUserId: session.user.id });
    return NextResponse.json({ ok: true, outcome });
  },
);
