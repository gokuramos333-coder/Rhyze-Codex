import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';
import { classes } from '@/lib/classes';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    '/',
    '/about',
    '/classes',
    '/instructors',
    '/pricing',
    '/shop',
    '/gallery',
    '/contact',
    '/join',
    '/policies',
  ].map((path) => ({
    url: `${site.url}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 1 : 0.7,
  }));

  const classRoutes = classes.map((c) => ({
    url: `${site.url}/classes/${c.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...routes, ...classRoutes];
}
