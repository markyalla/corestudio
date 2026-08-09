import { NextResponse } from "next/server";
import { apiHandler, requireRole } from "@/lib/rbac";
import { createBookingSchema } from "@/lib/validation";
import { bookSession } from "@/lib/booking";

/** Front-desk booking (staff). Member self-booking uses /api/app/bookings. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createBookingSchema.parse(await req.json());

  const booking = await bookSession({
    sessionId: body.sessionId,
    memberId: body.memberId,
    paidWith: body.paidWith,
    actorUserId: session.user.id,
    isStaff: true,
  });
  return NextResponse.json({ booking }, { status: 201 });
});
