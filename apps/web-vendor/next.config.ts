import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @ctmp/shared-types ships raw TypeScript (main: src/index.ts), so Next has
  // to compile it rather than expect a built package.
  transpilePackages: ['@ctmp/shared-types'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
