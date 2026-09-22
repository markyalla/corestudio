import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(9),
  specialty: z.string().max(200).default(""),
  commissionPercent: z.number().int().min(0).max(100).default(40),
  ptCommissionPercent: z.number().int().min(0).max(100).default(60),
  ptRateGHS: z.number().int().nonnegative().default(0), // pesewas
  calendarColor: z.string().default("#0ea5e9"),
  bio: z.string().max(2000).default(""),
  // Set by the owner and shared in person; the trainer changes it at /set-password.
  password: z.string().min(8).max(200),
});

export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = schema.parse(await req.json());

  const trainer = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: "TRAINER",
      },
    });
    const trainer = await tx.trainer.create({
      data: {
        userId: user.id,
        specialty: body.specialty,
        commissionPercent: body.commissionPercent,
        ptCommissionPercent: body.ptCommissionPercent,
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

  return NextResponse.json({ trainer }, { status: 201 });
});
