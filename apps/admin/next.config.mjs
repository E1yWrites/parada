import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Opt-in self-contained build for container images (apps/admin/Dockerfile
  // sets NEXT_OUTPUT_STANDALONE=1). Left off by default so `next start` keeps
  // working unchanged for the local/on-premise profile.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1"
    ? {
        output: "standalone",
        // Monorepo: trace workspace packages (@parada/types, @parada/config)
        // from the repository root, not just apps/admin.
        outputFileTracingRoot: path.join(here, "../.."),
      }
    : {}),
};

export default nextConfig;
