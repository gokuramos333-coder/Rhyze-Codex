import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RevenueAreaChart } from '@/components/admin/AnalyticsCharts';

describe('ADMIN financial charts', () => {
  it('renders a net-revenue series when refunds make a day negative', () => {
    const html = renderToStaticMarkup(
      <RevenueAreaChart
        title="Net revenue · This week"
        points={[
          { label: 'Sep 7', value: 2500 },
          { label: 'Sep 8', value: -1000 },
        ]}
      />,
    );

    expect(html).toContain('Net revenue · This week');
    expect(html).toContain('-$10.00');
    expect(html).toContain('data-zero-line="true"');
  });
});
