import { NextResponse } from "next/server";
import { apiHandler, requireRole } from "@/lib/rbac";
import { updateBookingSchema } from "@/lib/validation";
import { cancelBooking, checkInBooking, markNoShow } from "@/lib/booking";

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN", "TRAINER"]);
    const { id } = await ctx.params;
    const body = updateBookingSchema.parse(await req.json());

    switch (body.action) {
      case "CHECK_IN": {
        const booking = await checkInBooking({ bookingId: id, actorUserId: session.user.id });
        return NextResponse.json({ booking });
      }
      case "NO_SHOW": {
        const booking = await markNoShow({ bookingId: id, actorUserId: session.user.id });
        return NextResponse.json({ booking });
      }
      case "CANCEL": {
        const booking = await cancelBooking({
          bookingId: id,
          actorUserId: session.user.id,
          isStaff: true,
        });
        return NextResponse.json({ booking });
      }
    }
  },
);
