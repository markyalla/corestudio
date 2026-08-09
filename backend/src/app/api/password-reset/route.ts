import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/rbac";
import { verifyOtp } from "@/lib/otp";

const schema = z.object({
  phone: z.string().min(9),
  code: z.string().length(6),
  newPassword: z.string().min(8),
});

export const POST = apiHandler(async (req: Request) => {
  const body = schema.parse(await req.json());
  await verifyOtp(body.phone, "RESET_PASSWORD", body.code);

  const user = await prisma.user.findFirst({ where: { phone: body.phone } });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, 10) },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "user.password_reset", entity: "User", entityId: user.id },
  });
  return NextResponse.json({ ok: true });
});
