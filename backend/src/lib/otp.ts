import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { ApiError } from "./errors";
import { getNotificationService } from "./notifications";

export type OtpPurpose = "VERIFY_PHONE" | "RESET_PASSWORD";

const EXPIRY_MINS = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const SEND_WINDOW_MINS = 15;

export async function sendOtp(phone: string, purpose: OtpPurpose) {
  const windowStart = new Date(Date.now() - SEND_WINDOW_MINS * 60 * 1000);
  const recent = await prisma.otpCode.count({
    where: { phone, purpose, createdAt: { gte: windowStart } },
  });
  if (recent >= MAX_SENDS_PER_WINDOW) {
    throw new ApiError(429, "Too many codes requested — try again in a few minutes");
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.otpCode.create({
    data: {
      phone,
      purpose,
      codeHash: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + EXPIRY_MINS * 60 * 1000),
    },
  });
  await getNotificationService().sendSms(
    phone,
    `Your CoreStudio verification code is ${code}. It expires in ${EXPIRY_MINS} minutes.`,
  );
}

export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string) {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose, usedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new ApiError(400, "Code expired or not found — request a new one");
  if (otp.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "Too many attempts — request a new code");

  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(400, "Incorrect code");
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
}
