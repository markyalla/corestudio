import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { startWaitlistClaimCheckout } from "@/lib/payment-flows";

/** Claims a promoted waitlist spot (2-hour payment window) — the JSON/API
 *  equivalent of the SMS payment link, for the RN app. */
export const POST = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireMobileAuth(req, ["MEMBER"]);
    const { id } = await ctx.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { member: { include: { user: true } } },
    });
    if (!booking || booking.member.userId !== auth.user.id) {
      throw new ApiError(404, "Booking not found");
    }

    const { authorizationUrl, reference } = await startWaitlistClaimCheckout({
      bookingId: id,
      userEmail: booking.member.user.email,
      userName: booking.member.user.name,
      userPhone: booking.member.user.phone,
    });
    return NextResponse.json({ authorizationUrl, reference });
  },
);
