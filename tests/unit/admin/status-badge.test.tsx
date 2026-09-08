import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';

describe('admin status badge colors', () => {
  it('uses green for confirmed and attended records', () => {
    expect(renderToStaticMarkup(<AdminStatusBadge status="CONFIRMED" />)).toContain('bg-emerald-100');
    expect(renderToStaticMarkup(<AdminStatusBadge status="ATTENDED" />)).toContain('bg-emerald-100');
  });

  it('uses red for cancelled, late-cancelled, and no-show records', () => {
    expect(renderToStaticMarkup(<AdminStatusBadge status="CANCELLED" />)).toContain('bg-red-100');
    expect(renderToStaticMarkup(<AdminStatusBadge status="LATE_CANCELLED" />)).toContain('bg-red-100');
    expect(renderToStaticMarkup(<AdminStatusBadge status="NO_SHOW" />)).toContain('bg-red-100');
  });

  it('uses amber for paused memberships', () => {
    expect(renderToStaticMarkup(<AdminStatusBadge status="PAUSED" />)).toContain('bg-amber-100');
  });

  it('uses light blue for instructor accounts', () => {
    expect(renderToStaticMarkup(<AdminStatusBadge status="INSTRUCTOR" />)).toContain('bg-blue-100');
  });
});
