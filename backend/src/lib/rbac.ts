import { auth } from "../auth";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { verifyMobileToken } from "./mobile-auth";

export { ApiError } from "./errors";
import { ApiError } from "./errors";

/**
 * API-route guard: returns the session or throws an ApiError (401/403).
 * Usage: const session = await requireRole(["OWNER", "ADMIN"]);
 */
export async function requireRole(roles: Role[] | "ANY") {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "Not authenticated");
  if (roles !== "ANY" && !roles.includes(session.user.role as Role)) {
    throw new ApiError(403, "Forbidden");
  }
  return session;
}

/**
 * API-route guard for the mobile app: verifies the `Authorization: Bearer`
 * JWT (see lib/mobile-auth.ts) instead of a NextAuth cookie session. Shaped
 * like requireRole()'s return value so /api/app/** handlers read the same
 * way (`auth.user.id`, `auth.user.role`).
 */
export async function requireMobileAuth(req: Request, roles: Role[] | "ANY" = "ANY") {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new ApiError(401, "Missing bearer token");

  let payload;
  try {
    payload = await verifyMobileToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
  if (roles !== "ANY" && !roles.includes(payload.role as Role)) {
    throw new ApiError(403, "Forbidden");
  }
  return { user: { id: payload.userId, role: payload.role, memberId: payload.memberId } };
}

/** Wraps an API handler, converting ApiError/ZodError into JSON responses. */
export function apiHandler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err && typeof err === "object" && "issues" in err) {
        // ZodError
        return NextResponse.json(
          { error: "Validation failed", issues: (err as { issues: unknown }).issues },
          { status: 400 },
        );
      }
      console.error(err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
