import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { ApiError } from "./errors";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const LOCKOUT_WINDOW_MINS = 15;
const MAX_FAILED_ATTEMPTS = 6;

/**
 * Shared email+password check backing both NextAuth's Credentials provider
 * (admin/src/auth.ts, source="web") and the mobile login endpoint
 * (/api/app/auth/login, source="mobile") — one place for the bcrypt compare
 * so the two auth paths can't drift. Also the single place both surfaces'
 * logins get written to the audit trail (Settings → Audit Log in admin).
 *
 * Failed attempts against a nonexistent email aren't logged (typos/scans —
 * not a meaningful signal); a wrong password against a real account is.
 */
export async function verifyCredentials(raw: unknown, source: "web" | "mobile" = "web") {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  // Brute-force guard: count this account's own recent failures (not a
  // global/IP limit — mirrors otp.ts's per-identifier windowed lockout) and
  // refuse even a correct password once the threshold is hit, so a script
  // can't just keep trying indefinitely against one known email.
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINS * 60 * 1000);
  const recentFailures = await prisma.auditLog.count({
    where: { userId: user.id, action: "user.login_failed", createdAt: { gte: windowStart } },
  });
  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    throw new ApiError(429, "Too many failed login attempts — try again in a few minutes");
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    await audit(prisma, {
      userId: user.id, action: "user.login_failed", entity: "User",
      entityId: user.id, payload: { source },
    });
    return null;
  }

  await audit(prisma, {
    userId: user.id, action: "user.login", entity: "User",
    entityId: user.id, payload: { source },
  });
  return {
    id: user.id, name: user.name, email: user.email, role: user.role,
    tokenVersion: user.tokenVersion,
  };
}
