import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";

const createSchema = z
  .object({
    type: z.enum(["CANCEL_SESSION", "UNAVAILABLE"]),
    sessionId: z.string().optional(),
    message: z.string().trim().min(1, "Add a short message").max(500),
  })
  .refine((b) => b.type !== "CANCEL_SESSION" || !!b.sessionId, {
    message: "sessionId is required to request a class cancellation",
  });

const include = {
  trainer: { select: { id: true, user: { select: { name: true } } } },
  session: {
    select: {
      id: true,
      startsAt: true,
      status: true,
      classType: { select: { name: true } },
    },
  },
} as const;

/** Trainer→staff scheduling requests: "please cancel this class" or "I won't
 *  be available at this time" — the replacement for trainers editing their
 *  own calendar directly. OWNER/ADMIN see everyone's; a trainer sees only
 *  their own. */
export const GET = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN", "TRAINER"]);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const statusFilter =
    status && ["PENDING", "APPROVED", "DISMISSED"].includes(status)
      ? (status as "PENDING" | "APPROVED" | "DISMISSED")
      : undefined;

  let trainerId: string | undefined;
  if (session.user.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({ where: { userId: session.user.id } });
    if (!trainer) throw new ApiError(404, "No trainer profile for this account");
    trainerId = trainer.id;
  }

  const requests = await prisma.trainerRequest.findMany({
    where: { ...(trainerId ? { trainerId } : {}), ...(statusFilter ? { status: statusFilter } : {}) },
    include,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ requests });
});

/** Trainer files a request against their own record. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["TRAINER"]);
  const body = createSchema.parse(await req.json());

  const trainer = await prisma.trainer.findFirst({ where: { userId: session.user.id } });
  if (!trainer) throw new ApiError(404, "No trainer profile for this account");

  if (body.sessionId) {
    const target = await prisma.session.findUnique({ where: { id: body.sessionId } });
    if (!target || target.trainerId !== trainer.id) throw new ApiError(404, "Session not found");
    if (target.status !== "SCHEDULED") throw new ApiError(400, "That class isn't scheduled anymore");
  }

  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.trainerRequest.create({
      data: {
        trainerId: trainer.id,
        sessionId: body.sessionId ?? null,
        type: body.type,
        message: body.message,
      },
      include,
    });
    await audit(tx, {
      userId: session.user.id,
      action: "trainer_request.create",
      entity: "TrainerRequest",
      entityId: req.id,
      payload: { type: body.type, sessionId: body.sessionId ?? null },
    });
    return req;
  });
  return NextResponse.json({ request: created }, { status: 201 });
});
