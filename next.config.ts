import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // درایور Neon روی سرور، خارج از باندل serverless اجرا شود
  serverExternalPackages: ['@neondatabase/serverless'],
}

export default nextConfig
