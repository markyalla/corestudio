import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/rbac";
import { sendOtp, verifyOtp } from "@/lib/otp";

const sendSchema = z.object({
  action: z.literal("SEND"),
  phone: z.string().min(9),
  purpose: z.enum(["VERIFY_PHONE", "RESET_PASSWORD"]),
});
const verifySchema = z.object({
  action: z.literal("VERIFY"),
  phone: z.string().min(9),
  purpose: z.enum(["VERIFY_PHONE", "RESET_PASSWORD"]),
  code: z.string().length(6),
});
const schema = z.discriminatedUnion("action", [sendSchema, verifySchema]);

export const POST = apiHandler(async (req: Request) => {
  const body = schema.parse(await req.json());

  if (body.action === "SEND") {
    // Do not leak whether the phone exists; only send if it does.
    const user = await prisma.user.findFirst({ where: { phone: body.phone } });
    if (user) await sendOtp(body.phone, body.purpose);
    return NextResponse.json({ ok: true });
  }

  await verifyOtp(body.phone, body.purpose, body.code);
  if (body.purpose === "VERIFY_PHONE") {
    await prisma.user.updateMany({
      where: { phone: body.phone },
      data: { phoneVerifiedAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true, verified: true });
});
