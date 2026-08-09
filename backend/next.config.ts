import type { NextConfig } from "next";
import path from "path";

// node_modules (incl. `next` itself) is hoisted to the monorepo root by npm
// workspaces, so both of these must point there — Turbopack can't otherwise
// resolve its own package from backend/'s directory, and they're required to
// have the same value. This nests the standalone output under backend/ (see
// Dockerfile, which accounts for that layout).
const monorepoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
