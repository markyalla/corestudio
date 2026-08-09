import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(1).optional(),
  momoNumber: z.string().nullable().optional(),
  advanceBookingDays: z.number().int().min(1).max(90).optional(),
  cancelCutoffHours: z.number().int().min(0).max(168).optional(),
});

export const PATCH = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = schema.parse(await req.json());

  const studio = await prisma.studio.findFirstOrThrow();
  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.studio.update({ where: { id: studio.id }, data: body });
    await audit(tx, {
      userId: session.user.id,
      action: "studio.update",
      entity: "Studio",
      entityId: studio.id,
      payload: JSON.parse(JSON.stringify(body)),
    });
    return updated;
  });
  return NextResponse.json({ studio: updated });
});
