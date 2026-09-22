import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, requireRole } from "@/lib/rbac";
import { markPayoutPaid } from "@/lib/payouts";

const schema = z.object({
  action: z.literal("MARK_PAID"),
  reference: z.string().min(1, "MoMo transfer reference is required"),
});

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const payout = await markPayoutPaid({
      payoutId: id,
      reference: body.reference,
      actorUserId: session.user.id,
    });
    return NextResponse.json({ payout });
  },
);
