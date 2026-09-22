import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole, ApiError } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().min(9).max(20),
  role: z.enum(["ADMIN", "OWNER", "ACCOUNTANT", "TRAINER"]),
  password: z.string().min(8).max(200),
});

/** Owner or Admin adds a staff account with a password they set and share in
 *  person. The staff member changes it themselves at /set-password. A
 *  TRAINER also gets a Trainer profile with defaults — the owner fills in
 *  specialty, commission, PT rate etc. on the Trainers page afterwards.
 *  An Admin caller may only grant TRAINER/ACCOUNTANT — only an Owner can
 *  create another OWNER or ADMIN account. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = schema.parse(await req.json());
  if ((body.role === "OWNER" || body.role === "ADMIN") && session.user.role !== "OWNER") {
    throw new ApiError(403, "Only an owner can grant owner or admin access");
  }

  const user = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: body.role,
      },
    });
    if (body.role === "TRAINER") {
      await tx.trainer.create({ data: { userId: user.id } });
    }
    await audit(tx, {
      userId: session.user.id, action: "staff.invite", entity: "User",
      entityId: user.id, payload: { email: body.email, role: body.role },
    });
    return user;
  });

  return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
});
