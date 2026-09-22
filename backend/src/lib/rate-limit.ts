// Simple in-memory fixed-window rate limiter. Fine here because this app
// always runs as one persistent container (see docker-compose.yml — no
// serverless/multi-replica deploy), so in-process state doesn't need to be
// shared. Only meant for cheap protection on endpoints that can't use the
// DB-backed windowed checks (otp.ts, verify-credentials.ts) because they're
// unauthenticated and a DB write per anonymous hit would itself be a vector.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, opts: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return true;
  }
  if (bucket.count >= opts.max) return false;
  bucket.count++;
  return true;
}

/** Best-effort client IP from nginx's forwarded headers (see nginx.conf); "unknown" if absent. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
