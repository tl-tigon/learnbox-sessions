import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/links';

/**
 * Crawlers, search engines and AI alike, may read every page of the site. The app's screens and
 * the API are not for them. A rule matches by prefix, so the phone's page is named as `/s$` and
 * `/s?`, which leaves `/sitemap.xml` open.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/app', '/s$', '/s?', '/present', '/sign-in'] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}

export const dynamic = 'force-static';
