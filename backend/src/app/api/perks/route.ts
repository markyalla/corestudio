import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";

const createSchema = z.object({
  name: z.string().min(1).max(200),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createSchema.parse(await req.json());
  const perk = await prisma.$transaction(async (tx) => {
    const perk = await tx.perkItem.create({ data: body });
    await audit(tx, {
      userId: session.user.id, action: "perk.create", entity: "PerkItem",
      entityId: perk.id, payload: JSON.parse(JSON.stringify(body)),
    });
    return perk;
  });
  return NextResponse.json({ perk }, { status: 201 });
});

export const PATCH = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id, ...data } = updateSchema.parse(await req.json());
  const perk = await prisma.$transaction(async (tx) => {
    const perk = await tx.perkItem.update({ where: { id }, data });
    await audit(tx, {
      userId: session.user.id, action: "perk.update", entity: "PerkItem",
      entityId: id, payload: JSON.parse(JSON.stringify(data)),
    });
    return perk;
  });
  return NextResponse.json({ perk });
});
