import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  specialty: z.string().optional(),
  commissionPercent: z.number().int().min(0).max(100).optional(),
  ptRateGHS: z.number().int().nonnegative().optional(),
  calendarColor: z.string().optional(),
  bio: z.string().optional(),
});

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN"]);
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const trainer = await prisma.trainer.findUnique({ where: { id } });
    if (!trainer) throw new ApiError(404, "Trainer not found");

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainer.update({ where: { id }, data: body });
      await audit(tx, {
        userId: session.user.id,
        action: "trainer.update",
        entity: "Trainer",
        entityId: id,
        payload: JSON.parse(JSON.stringify(body)),
      });
      return updated;
    });
    return NextResponse.json({ trainer: updated });
  },
);
