import { describe, expect, it } from 'vitest';
import { resolveClassArtwork } from '@/lib/domain/schedule/class-artwork';

describe('class artwork fallback', () => {
  const instructor = { name: 'Test Teacher', instructorProfile: { isActive: true, photoUrl: '/portrait.jpg' } };
  it.each([
    ['/occurrence.jpg', '/template.jpg', '/occurrence.jpg'],
    [null, '/template.jpg', '/template.jpg'],
    [null, null, '/portrait.jpg'],
  ])('resolves override %s and template %s to %s', (imageUrl, templateImage, expected) => {
    expect(resolveClassArtwork({ imageUrl, template: { imageUrl: templateImage }, instructor })).toBe(expected);
  });
  it('uses brand fallback without an assigned portrait', () => {
    expect(resolveClassArtwork({})).toBe('/brand/rhyze-logo-header.png');
  });
  it('does not show an inactive assigned instructor portrait', () => {
    expect(resolveClassArtwork({ instructor: { ...instructor, instructorProfile: { isActive: false, photoUrl: '/inactive.jpg' } } })).toBe('/brand/rhyze-logo-header.png');
  });
  it('does not show the original instructor portrait for a named substitute', () => {
    expect(resolveClassArtwork({ instructor, substituteInstructorName: 'Someone Else' })).toBe('/brand/rhyze-logo-header.png');
  });
});
