import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Shared email+password check backing both NextAuth's Credentials provider
 * (admin/src/auth.ts) and the mobile login endpoint (/api/app/auth/login) —
 * one place for the bcrypt compare so the two auth paths can't drift.
 */
export async function verifyCredentials(raw: unknown) {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user) return null;

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
