import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
  ATTRIBUTION_COOKIE,
  captureFirstTouch,
  attributionFromCookie,
  attributionMetadata,
} from '@/lib/attribution/first-touch';

const now = new Date('2026-09-22T12:00:00.000Z');
const origin = 'https://www.rhyzefitness.com';
const campaign =
  '/join?utm_source=meta&utm_medium=paid_social&utm_campaign=test&fbclid=abc123';

describe('first-touch attribution', () => {
  it('captures campaign values and converts them to member and flat Stripe fields', () => {
    const cookie = captureFirstTouch(
      new URL(campaign, origin),
      'https://facebook.com/ads',
      now,
    );
    const member = attributionFromCookie(JSON.stringify(cookie), origin, now);
    expect(member).toMatchObject({
      source_label: 'Meta Ad',
      source_fbclid: 'abc123',
      source_utm_source: 'meta',
      source_utm_medium: 'paid_social',
      source_utm_campaign: 'test',
      source_referrer: 'https://facebook.com/ads',
      source_landing_path: '/join',
      source_captured_at: now,
    });
    expect(attributionMetadata(member)).toEqual({
      source_label: 'Meta Ad',
      source_fbclid: 'abc123',
      source_utm_source: 'meta',
      source_utm_medium: 'paid_social',
      source_utm_campaign: 'test',
      source_utm_term: '',
      source_utm_content: '',
      source_referrer: 'https://facebook.com/ads',
      source_landing_path: '/join',
      source_captured_at: now.toISOString(),
    });
  });

  it.each([
    ['?fbclid=click&utm_source=newsletter', '', 'Meta Ad'],
    ['?utm_source=Instagram', '', 'Meta Ad'],
    ['?utm_source=facebook', '', 'Meta Ad'],
    ['?utm_source=Newsletter', 'https://google.com/search', 'Newsletter'],
    ['', 'https://www.google.com/search?q=yoga', 'Organic Search'],
    ['', 'https://www.bing.com/search', 'Organic Search'],
    ['', 'https://local-news.example/article', 'Referral: local-news.example'],
    ['', 'https://rhyzefitness.com/classes', 'Direct'],
    ['', '', 'Direct'],
  ])('labels %s / %s by first-match priority', (query, referrer, expected) => {
    const cookie = captureFirstTouch(
      new URL(`/join${query}`, origin),
      referrer,
      now,
    );
    expect(
      attributionFromCookie(JSON.stringify(cookie), origin, now).source_label,
    ).toBe(expected);
  });

  it('handles absent, malformed and untrusted cookie values without breaking signup', () => {
    for (const value of [
      undefined,
      'not json',
      'null',
      '[]',
      '{"utm_source":{}}',
    ]) {
      expect(attributionFromCookie(value, origin, now).source_label).toBe(
        'Direct',
      );
    }
    expect(
      attributionFromCookie(
        '{"source_label":"Meta Ad","captured_at":"bad"}',
        origin,
        now,
      ),
    ).toMatchObject({ source_label: 'Direct', source_captured_at: now });
    expect(attributionMetadata({ source_label: null })).toEqual({});
    expect(
      attributionFromCookie(
        '{"captured_at":"-100000-01-01T00:00:00.000Z"}',
        origin,
        now,
      ).source_captured_at,
    ).toEqual(now);
  });

  it('bounds cookie size and Stripe metadata, including unicode, and drops referrer secrets', () => {
    const url = new URL('/join', origin);
    for (const key of [
      'fbclid',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ]) {
      url.searchParams.set(key, '💃'.repeat(1000));
    }
    const cookie = captureFirstTouch(
      url,
      'https://person:secret@other.example/page?token=secret#private',
      now,
    );
    expect(
      encodeURIComponent(JSON.stringify(cookie)).length,
    ).toBeLessThanOrEqual(3500);
    expect(cookie.referrer).not.toContain('secret');
    expect(cookie.referrer).not.toContain('private');
    const metadata = attributionMetadata(
      attributionFromCookie(JSON.stringify(cookie), origin, now),
    );
    expect(
      Object.values(metadata).every(
        (value) => typeof value === 'string' && value.length <= 500,
      ),
    ).toBe(true);
  });

  it('sets a first-party 90-day readable secure cookie and never replaces an existing one', () => {
    const response = middleware(new NextRequest(new URL(campaign, origin)));
    const cookie = response.cookies.get(ATTRIBUTION_COOKIE)!;
    expect(cookie).toMatchObject({
      name: 'rhyze_attribution',
      maxAge: 90 * 86400,
      sameSite: 'lax',
      path: '/',
      secure: true,
    });
    expect(cookie.httpOnly).not.toBe(true);
    expect(JSON.parse(cookie.value).fbclid).toBe('abc123');
    expect(response.headers.get('cache-control')).toContain('no-store');
    for (const existing of [cookie.value, 'malformed', '']) {
      const again = middleware(
        new NextRequest(`${origin}/?utm_source=other`, {
          headers: {
            cookie: `${ATTRIBUTION_COOKIE}=${encodeURIComponent(existing)}`,
          },
        }),
      );
      expect(again.cookies.get(ATTRIBUTION_COOKIE)).toBeUndefined();
    }
  });

  it('does not let assets, API calls or prefetches become a first page visit', () => {
    for (const path of [
      '/api/auth/session',
      '/_next/static/app.js',
      '/favicon.ico',
      '/images/logo.png',
    ]) {
      expect(
        middleware(new NextRequest(`${origin}${path}`)).cookies.get(
          ATTRIBUTION_COOKIE,
        ),
      ).toBeUndefined();
    }
    expect(
      middleware(
        new NextRequest(`${origin}/join`, { headers: { purpose: 'prefetch' } }),
      ).cookies.get(ATTRIBUTION_COOKIE),
    ).toBeUndefined();
  });
});
