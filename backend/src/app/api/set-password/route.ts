import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler } from "@/lib/rbac";

const schema = z.object({
  email: z.string().email().max(320),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(200),
});

/**
 * Self-service password change for staff/trainers who were given a password
 * by the owner. The current password authenticates the change — no session,
 * no OTP. Used from the public /set-password page.
 */
export const POST = apiHandler(async (req: Request) => {
  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  // Same error for a bad password and an unknown email — no account enumeration.
  const ok = user ? await bcrypt.compare(body.currentPassword, user.passwordHash) : false;
  if (!user || !ok) throw new ApiError(400, "Email or current password is wrong");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, 10) },
  });
  await audit(prisma, {
    userId: user.id,
    action: "user.password_changed",
    entity: "User",
    entityId: user.id,
  });
  return NextResponse.json({ ok: true });
});
