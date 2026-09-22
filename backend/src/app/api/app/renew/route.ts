import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { createCashPlanPayment, startRenewalCheckout } from "@/lib/payment-flows";

export const POST = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const body = await req.json().catch(() => ({}));
  const member = await prisma.member.findFirst({
    where: { userId: auth.user.id },
    include: { user: true, plan: true },
  });
  if (!member) throw new ApiError(404, "No member profile");
  if (!member.plan) throw new ApiError(400, "No plan on your account — ask the front desk to set one");

  if (body?.method === "cash") {
    const payment = await createCashPlanPayment({ member, plan: member.plan });
    return NextResponse.json({ cash: true, paymentId: payment.id });
  }

  const { authorizationUrl, reference } = await startRenewalCheckout({ member, plan: member.plan });
  return NextResponse.json({ authorizationUrl, reference });
});
