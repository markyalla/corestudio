import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Needed because this app imports source files from the sibling
  // ../backend workspace package (see tsconfig.json's "@backend/*" path).
  outputFileTracingRoot: path.join(__dirname, ".."),
  // /api/* proxying to the backend happens in src/proxy.ts, not here — see
  // the comment there for why (rewrites() is baked in at build time for
  // standalone output, so it can't read BACKEND_INTERNAL_URL at container
  // runtime).
  async headers() {
    // No HSTS/CSP yet — add Strict-Transport-Security once TLS is live
    // (see README's deployment section); sending it over plain HTTP would
    // be a no-op at best and a footgun if TLS is ever removed.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
