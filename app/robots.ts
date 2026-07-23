import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/signin',
          '/sign-in',
          '/sign-up',
          '/member/',
          '/instructor/',
          '/admin/',
          '/book/',
          '/api/',
        ],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
