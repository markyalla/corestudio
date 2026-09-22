import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";
import { assertPtWindowFree, toMinutes } from "@/lib/pt";

const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm");

const createSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeStr,
  endTime: timeStr,
  locationId: z.string().min(1),
  durationMins: z.number().int().min(15).max(240).default(60),
  title: z.string().max(80).default(""),
  priceGHS: z.number().int().nonnegative().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: timeStr.optional(),
  endTime: timeStr.optional(),
  locationId: z.string().min(1).optional(),
  durationMins: z.number().int().min(15).max(240).optional(),
  title: z.string().max(80).optional(),
  priceGHS: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

export const GET = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requireRole(["OWNER", "ADMIN"]);
  const windows = await prisma.ptWindow.findMany({
    where: { trainerId: id },
    include: { location: { select: { name: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return NextResponse.json({
    windows: windows.map((w) => ({
      id: w.id,
      dayOfWeek: w.dayOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
      locationId: w.locationId,
      locationName: w.location.name,
      durationMins: w.durationMins,
      title: w.title,
      priceGHS: w.priceGHS,
      active: w.active,
    })),
  });
});

export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createSchema.parse(await req.json());

  const start = toMinutes(body.startTime);
  const end = toMinutes(body.endTime);
  if (end - start < body.durationMins) {
    throw new ApiError(400, "The window must be at least one session long");
  }
  await assertPtWindowFree(prisma, id, { dayOfWeek: body.dayOfWeek, startMin: start, endMin: end });

  const trainer = await prisma.trainer.findUniqueOrThrow({ where: { id } });
  const priceGHS = body.priceGHS ?? trainer.ptRateGHS;
  if (priceGHS <= 0) {
    throw new ApiError(400, "Set a price for this window (or a PT rate on the trainer)");
  }

  const loc = await prisma.location.findUnique({ where: { id: body.locationId } });
  if (!loc || !loc.active) throw new ApiError(400, "Location not found");

  const window = await prisma.$transaction(async (tx) => {
    const created = await tx.ptWindow.create({
      data: {
        trainerId: id,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        locationId: body.locationId,
        durationMins: body.durationMins,
        title: body.title,
        priceGHS,
      },
    });
    await audit(tx, {
      userId: session.user.id, action: "pt_window.create", entity: "PtWindow",
      entityId: created.id, payload: { trainerId: id, dayOfWeek: body.dayOfWeek },
    });
    return created;
  });
  return NextResponse.json({ window }, { status: 201 });
});

export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id: windowId, ...data } = updateSchema.parse(await req.json());

  const existing = await prisma.ptWindow.findUnique({ where: { id: windowId } });
  if (!existing || existing.trainerId !== id) throw new ApiError(404, "Window not found");

  const start = toMinutes(data.startTime ?? existing.startTime);
  const end = toMinutes(data.endTime ?? existing.endTime);
  if (end - start < (data.durationMins ?? existing.durationMins)) {
    throw new ApiError(400, "The window must be at least one session long");
  }
  await assertPtWindowFree(prisma, id, {
    dayOfWeek: data.dayOfWeek ?? existing.dayOfWeek,
    startMin: start,
    endMin: end,
    excludeWindowId: windowId,
  });

  const window = await prisma.$transaction(async (tx) => {
    const updated = await tx.ptWindow.update({ where: { id: windowId }, data });
    await audit(tx, {
      userId: session.user.id, action: "pt_window.update", entity: "PtWindow",
      entityId: windowId, payload: JSON.parse(JSON.stringify(data)),
    });
    return updated;
  });
  return NextResponse.json({ window });
});
