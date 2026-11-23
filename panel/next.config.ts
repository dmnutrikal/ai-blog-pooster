import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The panel lives in panel/ of the blog pipeline's repo; the repo root has its own lockfile.
  turbopack: { root: join(process.cwd(), "..") },
};

export default nextConfig;
