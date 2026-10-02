import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

/**
 * The app builds to plain files (`out/`), served from a CDN with no server; the API runs apart,
 * as Lambdas (`src/api/lambda/`). In development, Next.js also serves the API through
 * `src/app/api/[...path]/route.dev.ts`, which only the development server picks up.
 */
const config = (phase: string): NextConfig => {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    output: dev ? undefined : 'export',
    pageExtensions: dev ? ['dev.ts', 'tsx', 'ts'] : ['tsx', 'ts'],
    /* NEXT_DIST_DIR=.next-check lets `next build` run while the dev server holds `.next`. */
    distDir: process.env.NEXT_DIST_DIR || '.next',
  };
};

export default config;
