import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";
import { cancelSession } from "@/lib/booking";

const patchSchema = z.object({
  action: z.enum(["CANCEL_SESSION", "DISMISS"]),
  mode: z.enum(["REFUND", "RESCHEDULE"]).default("REFUND"),
});

/** Staff resolves a trainer's request: cancel the linked class (this fans
 *  out the member-facing cancellation + refunds + SMS via cancelSession()),
 *  or dismiss it without touching the schedule. */
export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN"]);
    const { id } = await ctx.params;
    const { action, mode } = patchSchema.parse(await req.json());

    const existing = await prisma.trainerRequest.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Request not found");
    if (existing.status !== "PENDING") throw new ApiError(400, "This request was already resolved");

    if (action === "CANCEL_SESSION") {
      if (!existing.sessionId) throw new ApiError(400, "This request isn't linked to a class");
      await cancelSession({ sessionId: existing.sessionId, actorUserId: session.user.id, mode });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainerRequest.update({
        where: { id },
        data: {
          status: action === "CANCEL_SESSION" ? "APPROVED" : "DISMISSED",
          resolvedAt: new Date(),
          resolvedByUserId: session.user.id,
        },
      });
      await audit(tx, {
        userId: session.user.id,
        action: "trainer_request.resolve",
        entity: "TrainerRequest",
        entityId: id,
        payload: { action, mode: action === "CANCEL_SESSION" ? mode : undefined },
      });
      return updated;
    });
    return NextResponse.json({ request: updated });
  },
);
