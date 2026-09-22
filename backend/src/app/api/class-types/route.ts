import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { deleteOrConflict } from "@/lib/db-errors";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  durationMins: z.number().int().min(15).max(240).default(60),
  priceGHS: z.number().int().nonnegative(), // pesewas
  defaultCapacity: z.number().int().min(1).default(8),
  description: z.string().max(2000).default(""),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createSchema.parse(await req.json());
  const classType = await prisma.$transaction(async (tx) => {
    const ct = await tx.classType.create({ data: body });
    await audit(tx, {
      userId: session.user.id, action: "class_type.create", entity: "ClassType",
      entityId: ct.id, payload: JSON.parse(JSON.stringify(body)),
    });
    return ct;
  });
  return NextResponse.json({ classType }, { status: 201 });
});

export const PATCH = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id, ...data } = updateSchema.parse(await req.json());
  const classType = await prisma.$transaction(async (tx) => {
    const ct = await tx.classType.update({ where: { id }, data });
    await audit(tx, {
      userId: session.user.id, action: "class_type.update", entity: "ClassType",
      entityId: id, payload: JSON.parse(JSON.stringify(data)),
    });
    return ct;
  });
  return NextResponse.json({ classType });
});

export const DELETE = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
  await deleteOrConflict(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.classType.delete({ where: { id } });
        await audit(tx, { userId: session.user.id, action: "class_type.delete", entity: "ClassType", entityId: id, payload: {} });
      }),
    "Can't delete — this class type is still used by classes on the schedule.",
  );
  return NextResponse.json({ ok: true });
});
