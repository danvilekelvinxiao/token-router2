import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*",
      },
    ];
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
