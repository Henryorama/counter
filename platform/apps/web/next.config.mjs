import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This monorepo lives beside an unrelated legacy lockfile at the repo root;
  // pin the tracing root so Next doesn't infer the wrong workspace.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
