import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { deleteOrConflict } from "@/lib/db-errors";

const createSchema = z.object({ text: z.string().min(1).max(500) });
const updateSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(500).optional(),
  active: z.boolean().optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { text } = createSchema.parse(await req.json());
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.motivationMessage.create({
      data: { text, createdByUserId: session.user.id },
    });
    await audit(tx, {
      userId: session.user.id, action: "motivation.create", entity: "MotivationMessage",
      entityId: created.id, payload: { text },
    });
    return created;
  });
  return NextResponse.json({ message }, { status: 201 });
});

export const PATCH = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id, ...data } = updateSchema.parse(await req.json());
  const message = await prisma.$transaction(async (tx) => {
    const updated = await tx.motivationMessage.update({ where: { id }, data });
    await audit(tx, {
      userId: session.user.id, action: "motivation.update", entity: "MotivationMessage",
      entityId: id, payload: JSON.parse(JSON.stringify(data)),
    });
    return updated;
  });
  return NextResponse.json({ message });
});

export const DELETE = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
  await deleteOrConflict(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.motivationMessage.delete({ where: { id } });
        await audit(tx, { userId: session.user.id, action: "motivation.delete", entity: "MotivationMessage", entityId: id, payload: {} });
      }),
    "Can't delete this motivation message.",
  );
  return NextResponse.json({ ok: true });
});
