import { describe, expect, it } from 'vitest';
import { usesStudioChrome } from '@/lib/site-chrome';

describe('site chrome routing', () => {
  it('keeps public marketing pages inside the public header and footer', () => {
    expect(usesStudioChrome('/')).toBe(false);
    expect(usesStudioChrome('/classes')).toBe(false);
    expect(usesStudioChrome('/join')).toBe(false);
  });

  it('gives account and portal routes a dedicated full-screen shell', () => {
    expect(usesStudioChrome('/sign-in')).toBe(true);
    expect(usesStudioChrome('/sign-up')).toBe(true);
    expect(usesStudioChrome('/member/profile')).toBe(true);
    expect(usesStudioChrome('/instructor')).toBe(true);
    expect(usesStudioChrome('/admin/members')).toBe(true);
    expect(usesStudioChrome('/dashboard')).toBe(true);
  });
});
