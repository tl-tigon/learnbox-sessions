import type { MetadataRoute } from 'next';

/** Crawlers may read the site's pages. The app's screens and the API are not for them. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/app', '/s', '/present', '/sign-in'] } };
}

export const dynamic = 'force-static';
