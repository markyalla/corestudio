import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().regex(/^\+?\d{9,15}$/, "Enter a valid phone number"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const POST = apiHandler(async (req: Request) => {
  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase();

  // Members can only sign up once the studio has been set up (owner created).
  const studio = await prisma.studio.findFirst();
  if (!studio) {
    return NextResponse.json({ error: "This studio isn't taking sign-ups yet" }, { status: 503 });
  }

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone: body.phone }] },
  });
  if (clash) {
    return NextResponse.json(
      { error: "An account with this email or phone already exists" },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: body.name,
        email,
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: "MEMBER",
      },
    });
    await tx.member.create({ data: { userId: user.id } });
    await audit(tx, {
      userId: user.id,
      action: "user.signup",
      entity: "User",
      entityId: user.id,
      payload: { email },
    });
  });

  return NextResponse.json({ ok: true }, { status: 201 });
});
