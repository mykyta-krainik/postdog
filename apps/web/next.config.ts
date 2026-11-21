import type { NextConfig } from "next";

const apiOrigin = `http://localhost:${process.env.API_PORT ?? 4000}`;

const nextConfig: NextConfig = {
  transpilePackages: ["@postdog/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
  async redirects() {
    return [{ source: "/", destination: "/tasks", permanent: false }];
  },
};

export default nextConfig;
