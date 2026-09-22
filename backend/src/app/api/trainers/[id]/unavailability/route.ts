import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";
import { expandDates } from "@/lib/availability";

const postSchema = z
  .object({
    dates: z.array(z.string()).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    reason: z.string().default(""),
  })
  .refine((b) => (b.dates && b.dates.length > 0) || (b.startDate && b.endDate), {
    message: "Provide either dates[] or startDate+endDate",
  });

const deleteSchema = z.object({ dates: z.array(z.string()).min(1) });

export const GET = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    await requireRole(["OWNER", "ADMIN"]);

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const dates = await prisma.trainerUnavailability.findMany({
      where: {
        trainerId: id,
        ...(from || to
          ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      orderBy: { date: "asc" },
    });
    return NextResponse.json({ dates });
  },
);

export const POST = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const session = await requireRole(["OWNER", "ADMIN"]);
    const body = postSchema.parse(await req.json());

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const dates = expandDates(body).filter((d) => d.getTime() >= now.getTime());
    if (dates.length === 0) throw new ApiError(400, "No valid (future) dates given");

    await prisma.$transaction(async (tx) => {
      await tx.trainerUnavailability.createMany({
        data: dates.map((date) => ({
          trainerId: id,
          date,
          reason: body.reason,
          createdByUserId: session.user.id,
        })),
        skipDuplicates: true,
      });
      await audit(tx, {
        userId: session.user.id,
        action: "trainer.unavailability_add",
        entity: "Trainer",
        entityId: id,
        payload: { count: dates.length },
      });
    });

    // Informational only — surfaced so admin can manually resolve, not auto-cancelled.
    const dayRanges = dates.map((d) => [d, new Date(d.getTime() + 24 * 60 * 60 * 1000)] as const);
    const conflicts = await prisma.session.findMany({
      where: {
        trainerId: id,
        status: "SCHEDULED",
        OR: dayRanges.map(([gte, lt]) => ({ startsAt: { gte, lt } })),
      },
      select: { id: true, startsAt: true, classType: { select: { name: true } } },
    });

    return NextResponse.json({ marked: dates.length, conflicts }, { status: 201 });
  },
);

export const DELETE = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const session = await requireRole(["OWNER", "ADMIN"]);
    const { dates } = deleteSchema.parse(await req.json());

    const res = await prisma.trainerUnavailability.deleteMany({
      where: { trainerId: id, date: { in: dates.map((d) => new Date(d)) } },
    });
    await audit(prisma, {
      userId: session.user.id,
      action: "trainer.unavailability_remove",
      entity: "Trainer",
      entityId: id,
      payload: { count: res.count },
    });
    return NextResponse.json({ removed: res.count });
  },
);
