import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin events surface', () => {
  const source = readFileSync('app/(studio)/admin/events/page.tsx', 'utf8');

  it('adds daily weekly and monthly scheduled event controls like classes', () => {
    expect(source).toContain('scheduledOccurrences');
    expect(source).toContain('const occurrenceRange = range;');
    expect(source).toContain('Daily');
    expect(source).toContain('Weekly');
    expect(source).toContain('Monthly');
    expect(source).toContain('ALL EVENTS');
    expect(source).toContain('template: { isEvent: true }');
  });

  it('separates upcoming and past event occurrences with reconciled event receipts', () => {
    expect(source).toContain('UPCOMING');
    expect(source).toContain('PAST');
    expect(source).toContain('bg-rhyze-black/5');
    expect(source).toContain('EventReceiptSummary');
    expect(source).toContain('eventSummaries={report.eventSummaries}');
  });
});
