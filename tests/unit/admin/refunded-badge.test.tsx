import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RefundedBadge } from '@/components/admin/RefundedBadge';

describe('refunded status badge', () => {
  it('labels refunded activity explicitly for admins', () => {
    const html = renderToStaticMarkup(<RefundedBadge />);

    expect(html).toContain('aria-label="Refund status"');
    expect(html).toContain('REFUNDED');
  });
});
