import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { getNotificationService } from "@/lib/notifications";

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().min(9).max(20),
  role: z.enum(["ADMIN", "OWNER"]),
});

/** Staff invite: creates the account with a temporary password sent by SMS. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER"]);
  const body = schema.parse(await req.json());

  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const user = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        role: body.role,
      },
    });
    await audit(tx, {
      userId: session.user.id, action: "staff.invite", entity: "User",
      entityId: user.id, payload: { email: body.email, role: body.role },
    });
    return user;
  });

  await getNotificationService().sendSms(
    body.phone,
    `You've been added to CoreStudio as ${body.role}. Log in at ${process.env.AUTH_URL}/login with ${body.email} and temporary password: ${tempPassword}`,
  );
  return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
});
