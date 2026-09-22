import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";
import { uploadDataUrlImage } from "@/lib/storage";

const schema = z.object({
  specialty: z.string().optional(),
  commissionPercent: z.number().int().min(0).max(100).optional(),
  ptCommissionPercent: z.number().int().min(0).max(100).optional(),
  ptRateGHS: z.number().int().nonnegative().optional(),
  calendarColor: z.string().optional(),
  bio: z.string().optional(),
  photoDataUrl: z.string().optional(),
});

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN", "TRAINER"]);
    const { id } = await ctx.params;
    const { photoDataUrl, ...body } = schema.parse(await req.json());

    const trainer = await prisma.trainer.findUnique({ where: { id } });
    if (!trainer) throw new ApiError(404, "Trainer not found");

    // A trainer may only change their own photo — nothing else, and not
    // another trainer's record. Business fields (specialty, commission, PT
    // rate) stay staff-only, same as the rest of the trainer profile.
    if (session.user.role === "TRAINER") {
      if (trainer.userId !== session.user.id) throw new ApiError(403, "Forbidden");
      if (Object.keys(body).length > 0) throw new ApiError(403, "Trainers can only update their own photo");
    }

    const data: typeof body & { photoUrl?: string } = { ...body };
    if (photoDataUrl) data.photoUrl = await uploadDataUrlImage(photoDataUrl, `trainers/${id}`);

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.trainer.update({ where: { id }, data });
      await audit(tx, {
        userId: session.user.id,
        action: "trainer.update",
        entity: "Trainer",
        entityId: id,
        payload: JSON.parse(JSON.stringify(data)),
      });
      return updated;
    });
    return NextResponse.json({ trainer: updated });
  },
);
