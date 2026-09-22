import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().min(9).max(20).optional(),
  password: z.string().min(8).max(200),
});

/** One-time bootstrap: the first web registrant becomes OWNER and, if none
 *  exists yet, creates the singleton Studio row. Public (no session) — the
 *  403-once-an-owner-exists check is what keeps this from being reusable. */
export const POST = apiHandler(async (req: Request) => {
  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase();

  const ownerCount = await prisma.user.count({ where: { role: "OWNER" } });
  if (ownerCount > 0) throw new ApiError(403, "This studio already has an owner");

  const clash = await prisma.user.findFirst({
    where: body.phone ? { OR: [{ email }, { phone: body.phone }] } : { email },
  });
  if (clash) throw new ApiError(409, "An account with this email or phone already exists");

  const user = await prisma.$transaction(async (tx) => {
    const studio = await tx.studio.findFirst();
    if (!studio) {
      await tx.studio.create({ data: { name: "CoreStudio" } });
    }

    const user = await tx.user.create({
      data: {
        name: body.name,
        email,
        phone: body.phone ?? null,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: "OWNER",
      },
    });
    await audit(tx, {
      userId: user.id,
      action: "user.owner_signup",
      entity: "User",
      entityId: user.id,
      payload: { email },
    });
    return user;
  });

  return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
});
