import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireMobileAuth } from "@/lib/rbac";
import { cancelBooking } from "@/lib/booking";

const schema = z.object({ action: z.enum(["CANCEL"]) });

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireMobileAuth(req, ["MEMBER"]);
    const { id } = await ctx.params;
    schema.parse(await req.json());

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { member: true },
    });
    if (!booking || booking.member.userId !== auth.user.id) {
      throw new ApiError(404, "Booking not found");
    }

    const updated = await cancelBooking({
      bookingId: id,
      actorUserId: auth.user.id,
      isStaff: false,
    });
    return NextResponse.json({ booking: updated });
  },
);
