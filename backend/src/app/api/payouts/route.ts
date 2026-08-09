import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, requireRole } from "@/lib/rbac";
import { createPayout } from "@/lib/payouts";

const schema = z.object({ trainerId: z.string().min(1) });

/** Creates a Payout with PayoutLines atomically for everything owed. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { trainerId } = schema.parse(await req.json());
  const payout = await createPayout({ trainerId, actorUserId: session.user.id });
  return NextResponse.json({ payout }, { status: 201 });
});
