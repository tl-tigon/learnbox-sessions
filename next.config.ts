import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* NEXT_DIST_DIR=.next-check lets `next build` run while the dev server holds `.next`. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default config;
