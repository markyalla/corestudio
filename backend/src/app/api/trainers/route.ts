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
  email: z.string().email(),
  phone: z.string().min(9),
  specialty: z.string().max(200).default(""),
  commissionPercent: z.number().int().min(0).max(100).default(40),
  ptRateGHS: z.number().int().nonnegative().default(0), // pesewas
  calendarColor: z.string().default("#0ea5e9"),
  bio: z.string().max(2000).default(""),
  password: z.string().min(8).optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = schema.parse(await req.json());

  // No password typed → generate one and text it, same pattern as staff
  // invites (backend/src/app/api/staff/route.ts) — never a fixed default.
  const tempPassword = body.password ?? crypto.randomBytes(6).toString("base64url");

  const trainer = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        role: "TRAINER",
      },
    });
    const trainer = await tx.trainer.create({
      data: {
        userId: user.id,
        specialty: body.specialty,
        commissionPercent: body.commissionPercent,
        ptRateGHS: body.ptRateGHS,
        calendarColor: body.calendarColor,
        bio: body.bio,
      },
    });
    await audit(tx, {
      userId: session.user.id,
      action: "trainer.create",
      entity: "Trainer",
      entityId: trainer.id,
      payload: { email: body.email },
    });
    return trainer;
  });

  if (!body.password) {
    await getNotificationService().sendSms(
      body.phone,
      `Welcome to CoreStudio! Log in with ${body.email} and temporary password: ${tempPassword}`,
    );
  }

  return NextResponse.json({ trainer }, { status: 201 });
});
