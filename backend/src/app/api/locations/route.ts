import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { deleteOrConflict } from "@/lib/db-errors";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(2000).default(""),
  phone: z.string().max(30).default(""),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createSchema.parse(await req.json());
  const location = await prisma.$transaction(async (tx) => {
    const loc = await tx.location.create({ data: body });
    await audit(tx, {
      userId: session.user.id, action: "location.create", entity: "Location",
      entityId: loc.id, payload: JSON.parse(JSON.stringify(body)),
    });
    return loc;
  });
  return NextResponse.json({ location }, { status: 201 });
});

export const PATCH = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id, ...data } = updateSchema.parse(await req.json());
  const location = await prisma.$transaction(async (tx) => {
    const loc = await tx.location.update({ where: { id }, data });
    await audit(tx, {
      userId: session.user.id, action: "location.update", entity: "Location",
      entityId: id, payload: JSON.parse(JSON.stringify(data)),
    });
    return loc;
  });
  return NextResponse.json({ location });
});

export const DELETE = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
  await deleteOrConflict(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.location.delete({ where: { id } });
        await audit(tx, { userId: session.user.id, action: "location.delete", entity: "Location", entityId: id, payload: {} });
      }),
    "Can't delete — this location still has classes, bookings or members pointed at it.",
  );
  return NextResponse.json({ ok: true });
});
