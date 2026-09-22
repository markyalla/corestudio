import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { deleteOrConflict } from "@/lib/db-errors";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  classTypeId: z.string().min(1),
  sessionsGranted: z.number().int().min(1),
  priceGHS: z.number().int().nonnegative(), // pesewas
  validDays: z.number().int().min(1),
  perkIds: z.array(z.string()).default([]),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

/** One-time session bundles (e.g. "Thai Massage 90min — Buy 7 Get 1"), each
 *  scoped to one ClassType — see Package in schema.prisma. */
export const GET = apiHandler(async () => {
  await requireRole(["OWNER", "ADMIN"]);
  const packages = await prisma.package.findMany({
    include: { classType: { select: { name: true, priceGHS: true } }, perks: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ packages });
});

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { perkIds, ...body } = createSchema.parse(await req.json());
  const pkg = await prisma.$transaction(async (tx) => {
    const pkg = await tx.package.create({
      data: { ...body, perks: { connect: perkIds.map((id) => ({ id })) } },
    });
    await audit(tx, {
      userId: session.user.id, action: "package.create", entity: "Package",
      entityId: pkg.id, payload: JSON.parse(JSON.stringify({ ...body, perkIds })),
    });
    return pkg;
  });
  return NextResponse.json({ package: pkg }, { status: 201 });
});

export const PATCH = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id, perkIds, ...data } = updateSchema.parse(await req.json());
  const pkg = await prisma.$transaction(async (tx) => {
    const pkg = await tx.package.update({
      where: { id },
      data: {
        ...data,
        ...(perkIds ? { perks: { set: perkIds.map((pid) => ({ id: pid })) } } : {}),
      },
    });
    await audit(tx, {
      userId: session.user.id, action: "package.update", entity: "Package",
      entityId: id, payload: JSON.parse(JSON.stringify({ ...data, perkIds })),
    });
    return pkg;
  });
  return NextResponse.json({ package: pkg });
});

export const DELETE = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
  await deleteOrConflict(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.package.delete({ where: { id } });
        await audit(tx, { userId: session.user.id, action: "package.delete", entity: "Package", entityId: id, payload: {} });
      }),
    "Can't delete — members already hold this package. Mark it inactive instead.",
  );
  return NextResponse.json({ ok: true });
});
