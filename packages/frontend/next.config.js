/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hide the framework dev badge (bottom-left circle) in `next dev`.
  devIndicators: false,
  transpilePackages: ['@intervai/backend'],
  experimental: {},
};

module.exports = nextConfig;
