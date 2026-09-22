import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { deleteOrConflict } from "@/lib/db-errors";

// Optional image, sent as a data: URL (see Announcement.imageUrl). Capped
// well above what a compressed promo image needs, to stop an accidental
// multi-megabyte upload from bloating the row — the admin form itself also
// downsizes before encoding, this is just the server-side backstop.
const imageUrlSchema = z
  .string()
  .max(4_500_000)
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, "Image must be a PNG, JPEG, WEBP or GIF")
  .nullable()
  .optional();

const createSchema = z.object({
  kind: z.enum(["ANNOUNCEMENT", "PROMOTION"]),
  title: z.string().min(1).max(200),
  body: z.string().max(4000).default(""),
  imageUrl: imageUrlSchema,
  endsAt: z.string().datetime().nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["ANNOUNCEMENT", "PROMOTION"]).optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(4000).optional(),
  imageUrl: imageUrlSchema,
  endsAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
});

/** Audit payloads shouldn't carry the (potentially megabyte-sized) image data
 *  URL — log that one was set/cleared instead of the bytes themselves. */
function redactImage<T extends { imageUrl?: string | null }>(data: T) {
  if (data.imageUrl === undefined) return data;
  return { ...data, imageUrl: data.imageUrl ? "<image data>" : null };
}

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { endsAt, ...rest } = createSchema.parse(await req.json());
  const announcement = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { ...rest, endsAt: endsAt ? new Date(endsAt) : null, createdByUserId: session.user.id },
    });
    await audit(tx, {
      userId: session.user.id, action: "announcement.create", entity: "Announcement",
      entityId: created.id, payload: JSON.parse(JSON.stringify(redactImage(rest))),
    });
    return created;
  });
  return NextResponse.json({ announcement }, { status: 201 });
});

export const PATCH = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id, endsAt, ...rest } = updateSchema.parse(await req.json());
  const data = { ...rest, ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}) };
  const announcement = await prisma.$transaction(async (tx) => {
    const updated = await tx.announcement.update({ where: { id }, data });
    await audit(tx, {
      userId: session.user.id, action: "announcement.update", entity: "Announcement",
      entityId: id, payload: JSON.parse(JSON.stringify(redactImage(data))),
    });
    return updated;
  });
  return NextResponse.json({ announcement });
});

export const DELETE = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
  await deleteOrConflict(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.announcement.delete({ where: { id } });
        await audit(tx, { userId: session.user.id, action: "announcement.delete", entity: "Announcement", entityId: id, payload: {} });
      }),
    "Can't delete this announcement.",
  );
  return NextResponse.json({ ok: true });
});
