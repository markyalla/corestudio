import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { createCashPackagePayment, startPackageCheckout } from "@/lib/payment-flows";

/** Self-serve package purchase. Body may include `{ "method": "cash" }` to
 *  instead create a PENDING cash payment that staff confirm in person. */
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

    const pkg = await prisma.package.findUnique({ where: { id } });
    if (!pkg || !pkg.active) throw new ApiError(404, "Package not found");

    if (body?.method === "cash") {
      const payment = await createCashPackagePayment({ member, pkg });
      return NextResponse.json({ cash: true, paymentId: payment.id });
    }

    const { authorizationUrl, reference } = await startPackageCheckout({ member, pkg });
    return NextResponse.json({ authorizationUrl, reference });
  },
);
