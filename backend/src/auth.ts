import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Verification-only NextAuth instance: no Credentials provider (no Prisma/bcrypt
// needed here — that only happens where sign-in occurs, in the admin app).
// Session strategy is "jwt", so this can validate the cookie set by admin's
// NextAuth instance as long as both share AUTH_SECRET — no DB round-trip.
export const { auth } = NextAuth(authConfig);
