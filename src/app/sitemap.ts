import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/links';
import { FEATURES } from '@/lib/site';

/** The site's pages, for search engines. The app's screens are not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['/', '/product', ...FEATURES.map((f) => `/features/${f.slug}`), '/use-cases', '/pricing'];
  return pages.map((p) => ({ url: `${SITE}${p}` }));
}

export const dynamic = 'force-static';
