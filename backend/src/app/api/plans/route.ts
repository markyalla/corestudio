import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { deleteOrConflict } from "@/lib/db-errors";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  priceGHS: z.number().int().nonnegative(), // pesewas
  classesPerCycle: z.number().int().min(0),
  bonusCredits: z.number().int().min(0).default(0),
  cycleDays: z.number().int().min(1).default(30),
  description: z.string().max(2000).default(""),
  perkIds: z.array(z.string()).default([]),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { perkIds, ...body } = createSchema.parse(await req.json());
  const plan = await prisma.$transaction(async (tx) => {
    const plan = await tx.membershipPlan.create({
      data: { ...body, perks: { connect: perkIds.map((id) => ({ id })) } },
    });
    await audit(tx, {
      userId: session.user.id, action: "plan.create", entity: "MembershipPlan",
      entityId: plan.id, payload: JSON.parse(JSON.stringify({ ...body, perkIds })),
    });
    return plan;
  });
  return NextResponse.json({ plan }, { status: 201 });
});

export const PATCH = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id, perkIds, ...data } = updateSchema.parse(await req.json());
  const plan = await prisma.$transaction(async (tx) => {
    const plan = await tx.membershipPlan.update({
      where: { id },
      data: {
        ...data,
        ...(perkIds ? { perks: { set: perkIds.map((pid) => ({ id: pid })) } } : {}),
      },
    });
    await audit(tx, {
      userId: session.user.id, action: "plan.update", entity: "MembershipPlan",
      entityId: id, payload: JSON.parse(JSON.stringify({ ...data, perkIds })),
    });
    return plan;
  });
  return NextResponse.json({ plan });
});

export const DELETE = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
  await deleteOrConflict(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.membershipPlan.delete({ where: { id } });
        await audit(tx, { userId: session.user.id, action: "plan.delete", entity: "MembershipPlan", entityId: id, payload: {} });
      }),
    "Can't delete — members are still on this plan. Move them to another plan first.",
  );
  return NextResponse.json({ ok: true });
});
