import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS for the mobile API only. Native app builds never hit the browser's
 * same-origin policy, but the Expo *web* build does — and every /api/app/**
 * route is bearer-token authenticated (no cookies), so reflecting the
 * request origin here carries none of the credentialed-CORS risk it would
 * on the staff-facing (NextAuth session cookie) endpoints, which this does
 * not touch.
 */
export default function proxy(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: "/api/app/:path*",
};
