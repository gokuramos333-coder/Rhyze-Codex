import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmailTestSubmitButtonView } from '@/components/admin/EmailTestSubmitButton';

describe('email test submit feedback', () => {
  it('shows that the test is sending and prevents duplicate submissions', () => {
    const html = renderToStaticMarkup(<EmailTestSubmitButtonView pending />);

    expect(html).toContain('Sending test email…');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });

  it('shows the send call to action when idle', () => {
    const html = renderToStaticMarkup(<EmailTestSubmitButtonView pending={false} />);

    expect(html).toContain('Send test email');
    expect(html).not.toContain('disabled=""');
  });
});
