import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const STAFF_ROLES = ["OWNER", "ADMIN", "TRAINER"];

export default auth((req) => {
  const { nextUrl } = req;
  const role = req.auth?.user?.role;
  const path = nextUrl.pathname;

  // Forward everything except /api/auth/** (served locally — see
  // src/app/api/auth/[...nextauth]) to the backend. Done here rather than in
  // next.config.ts's rewrites(), which for `output: "standalone"` is
  // resolved once at build time and baked into required-server-files.json —
  // it does NOT re-read process.env at container runtime. Proxy runs fresh
  // on every request, so it picks up BACKEND_INTERNAL_URL correctly.
  if (path.startsWith("/api/") && !path.startsWith("/api/auth")) {
    const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000";
    const target = new URL(path + nextUrl.search, backendUrl);
    return NextResponse.rewrite(target);
  }

  if (path.startsWith("/admin")) {
    if (!role) {
      const login = new URL("/login", nextUrl);
      login.searchParams.set("callbackUrl", path);
      return NextResponse.redirect(login);
    }
    if (!STAFF_ROLES.includes(role)) {
      // Members have no web destination — they use the mobile app.
      return NextResponse.redirect(new URL("/", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
