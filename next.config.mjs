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
      // Proxy New API admin UI through FlowAPI so no need to expose port 3001
      {
        source: "/newapi-admin/:path*",
        destination: "http://localhost:3001/:path*",
      },
      {
        source: "/newapi-admin",
        destination: "http://localhost:3001/",
      },
    ];
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
