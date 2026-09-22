import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { createCashPlanPayment, startRenewalCheckout } from "@/lib/payment-flows";

/** Self-serve plan purchase/switch — same checkout+fulfilment as renewing,
 *  just aimed at a plan the member may not have had before. Body may include
 *  `{ "method": "cash" }` to instead create a PENDING cash payment that
 *  staff confirm in person (see /api/staff/payments/[id]/confirm-cash). */
export const POST = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireMobileAuth(req, ["MEMBER"]);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const member = await prisma.member.findFirst({
      where: { userId: auth.user.id },
      include: { user: true },
    });
    if (!member) throw new ApiError(404, "No member profile for this account");
    if (!member.preferredLocationId) {
      throw new ApiError(400, "Choose your studio location before subscribing to a plan");
    }

    const plan = await prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan || !plan.active) throw new ApiError(404, "Plan not found");

    if (body?.method === "cash") {
      const payment = await createCashPlanPayment({ member, plan });
      return NextResponse.json({ cash: true, paymentId: payment.id });
    }

    const { authorizationUrl, reference } = await startRenewalCheckout({
      member,
      plan,
      description: member.planId === plan.id ? `${plan.name} renewal` : `${plan.name} subscription`,
    });
    return NextResponse.json({ authorizationUrl, reference });
  },
);
