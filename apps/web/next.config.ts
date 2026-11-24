import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The API reads API_PORT from the repo-root .env (apps/api/src/config/env.ts), so the proxy
// reads the same file. Next.js only loads .env files from apps/web. Real env vars win.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const apiOrigin = `http://localhost:${process.env.API_PORT ?? 4000}`;

const nextConfig: NextConfig = {
  transpilePackages: ['@postdog/shared'],
  // The dev indicator sits over the sidebar's bottom-left toggle. Build and runtime errors still show.
  devIndicators: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
  async redirects() {
    return [{ source: '/', destination: '/tasks', permanent: false }];
  },
};

export default nextConfig;
