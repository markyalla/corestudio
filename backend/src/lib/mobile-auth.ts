import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { prisma } from "./prisma";

export interface MobileTokenPayload {
  userId: string;
  role: string;
  memberId: string | null;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/** Issues a bearer token for the RN app. Reuses AUTH_SECRET (HS256, distinct
 *  from — and never sent as — the NextAuth session cookie admin/web uses).
 *  Embeds the user's current tokenVersion so a password change or explicit
 *  "log out everywhere" (both bump it) invalidates every token issued
 *  before that point, even though the token itself is otherwise stateless. */
export async function issueMobileToken(
  payload: MobileTokenPayload & { tokenVersion: number },
): Promise<string> {
  return new SignJWT({
    role: payload.role,
    memberId: payload.memberId,
    tokenVersion: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifyMobileToken(token: string): Promise<MobileTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
  if (!payload.sub) throw new joseErrors.JWTInvalid("Missing subject");

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true },
  });
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    // Deliberately the same generic failure the caller (requireMobileAuth)
    // already normalizes to a 401 — don't distinguish "revoked" from
    // "malformed" for an attacker probing a stolen token.
    throw new joseErrors.JWTClaimValidationFailed(
      "Token revoked",
      payload,
      "tokenVersion",
      "invalid",
    );
  }

  return {
    userId: payload.sub,
    role: payload.role as string,
    memberId: (payload.memberId as string | null) ?? null,
  };
}
