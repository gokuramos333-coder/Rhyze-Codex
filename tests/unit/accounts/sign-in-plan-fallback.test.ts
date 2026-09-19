import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/(auth)/sign-in/page.tsx', 'utf8');
// Exercise the page's actual destination expressions without importing server actions.
const destinationCode = source.slice(source.indexOf('  const callbackUrl ='), source.indexOf('\n  return ('));
const destinations = new Function('searchParams', `${destinationCode}\nreturn { callbackUrl, signUpHref };`) as (
  params: { plan?: string; callbackUrl?: string }
) => { callbackUrl: string; signUpHref: string };

describe('sign-in plan fallback', () => {
  it.each(['intro-offer', 'elevate', 'ritual', 'eight-class-pack', 'vip-access-pass', 'a&b/#?'])('preserves %s in the form and account creation destination', (plan) => {
    const callbackUrl = `/member/membership?plan=${encodeURIComponent(plan)}#available-plans`;
    expect(destinations({ plan })).toEqual({ callbackUrl, signUpHref: `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}` });
  });

  it('keeps an explicit local callback ahead of the plan', () => {
    expect(destinations({ plan: 'elevate', callbackUrl: '/book/zumba?occurrence=123' }).callbackUrl).toBe('/book/zumba?occurrence=123');
  });

  it.each(['https://example.com', '//example.com', ''])('falls back from unsafe or empty callback %s', (callbackUrl) => {
    expect(destinations({ plan: 'elevate', callbackUrl }).callbackUrl).toBe('/member/membership?plan=elevate#available-plans');
  });

  it('retains ordinary sign-in behavior without a destination', () => {
    expect(destinations({})).toEqual({ callbackUrl: '', signUpHref: '/sign-up' });
    expect(destinations({ callbackUrl: '//example.com' })).toEqual({ callbackUrl: '', signUpHref: '/sign-up' });
  });

  it('wires the resolved callback into both form and account creation link', () => {
    expect(source).toContain('name="callbackUrl" value={callbackUrl}');
    expect(source).toContain('href={signUpHref}');
  });
});
