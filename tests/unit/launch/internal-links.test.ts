import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    return statSync(absolute).isDirectory() ? walk(absolute) : [absolute];
  });
}

function routePattern(pageFile: string) {
  const route = path
    .relative('app', path.dirname(pageFile))
    .split(path.sep)
    .filter((part) => !part.startsWith('('))
    .map((part) => (part.startsWith('[') ? '[dynamic]' : part))
    .join('/');
  return `/${route}`.replace(/\/$/, '') || '/';
}

describe('launch links', () => {
  const pageFiles = walk('app').filter((file) => file.endsWith('/page.tsx'));
  const routePatterns = pageFiles.map(routePattern);
  const sourceFiles = [...walk('app'), ...walk('components')].filter((file) =>
    file.endsWith('.tsx'),
  );

  it('resolves every literal internal href to an App Router page', () => {
    const unresolved: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /href\s*=\s*(?:\{)?["'`](\/[A-Za-z0-9_./?#=&%-]*)["'`](?:\})?/g,
      )) {
        const href = match[1];
        const pathname = href.split(/[?#]/)[0].replace(/\/$/, '') || '/';
        const segments = pathname.split('/').filter(Boolean);
        const resolves = routePatterns.some((pattern) => {
          const routeSegments = pattern.split('/').filter(Boolean);
          return (
            routeSegments.length === segments.length &&
            routeSegments.every(
              (segment, index) =>
                segment === '[dynamic]' || segment === segments[index],
            )
          );
        });
        if (!resolves) unresolved.push(`${href} in ${file}`);
      }
    }

    expect(unresolved).toEqual([]);
  });

  it('keeps the requested public launch routes available', () => {
    const requestedRoutes = [
      '/',
      '/about',
      '/classes',
      '/schedule',
      '/events',
      '/events/[dynamic]',
      '/book/[dynamic]',
      '/book/event/[dynamic]',
      '/instructors',
      '/shop',
      '/gallery',
      '/contact',
      '/join',
      '/policies',
      '/sign-in',
      '/sign-up',
      '/dashboard',
      '/checkout',
      '/checkout/success',
      '/checkout/cancel',
    ];

    expect(routePatterns).toEqual(expect.arrayContaining(requestedRoutes));
  });
});
