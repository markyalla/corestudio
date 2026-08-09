import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

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
 *  from — and never sent as — the NextAuth session cookie admin/web uses). */
export async function issueMobileToken(payload: MobileTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role, memberId: payload.memberId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifyMobileToken(token: string): Promise<MobileTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (!payload.sub) throw new joseErrors.JWTInvalid("Missing subject");
  return {
    userId: payload.sub,
    role: payload.role as string,
    memberId: (payload.memberId as string | null) ?? null,
  };
}
