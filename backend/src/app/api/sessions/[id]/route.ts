import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";
import { updateSessionSchema } from "@/lib/validation";
import { cancelSession } from "@/lib/booking";
import { assertNoTrainerSessionOverlap, assertTrainerAvailable } from "@/lib/availability";

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN"]);
    const { id } = await ctx.params;
    const body = updateSessionSchema.parse(await req.json());

    if ("action" in body) {
      await cancelSession({ sessionId: id, actorUserId: session.user.id, mode: body.mode });
      return NextResponse.json({ ok: true });
    }

    const existing = await prisma.session.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Session not found");

    // Re-check the hard block if the trainer or the slot itself is changing —
    // same invariant as creating a new session (backend/src/lib/availability.ts).
    if (body.trainerId || body.startsAt) {
      const trainerId = body.trainerId ?? existing.trainerId;
      const startsAt = body.startsAt ?? existing.startsAt;
      await assertTrainerAvailable(prisma, trainerId, [startsAt]);
      await assertNoTrainerSessionOverlap(prisma, trainerId, startsAt, existing.durationMins, id);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.session.update({ where: { id }, data: body });
      await audit(tx, {
        userId: session.user.id,
        action: "session.update",
        entity: "Session",
        entityId: id,
        payload: JSON.parse(JSON.stringify(body)),
      });
      return updated;
    });
    return NextResponse.json({ session: updated });
  },
);
