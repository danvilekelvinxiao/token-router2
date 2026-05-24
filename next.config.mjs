import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
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
      // New API admin SPA uses absolute /static and /api/* paths.
      // Keep these narrow so FlowAPI's own /api routes remain under local control.
      {
        source: "/static/:path*",
        destination: "http://localhost:3001/static/:path*",
      },
      // New API admin JSON endpoints are implemented as local API proxy routes
      // under pages/api/{channel,token,log,group,option,status}.
      {
        source: "/api/user/self",
        destination: "http://localhost:3001/api/user/self",
      },
      {
        source: "/api/user/login",
        destination: "http://localhost:3001/api/user/login",
      },
      {
        source: "/api/user/logout",
        destination: "http://localhost:3001/api/user/logout",
      },
    ];
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
