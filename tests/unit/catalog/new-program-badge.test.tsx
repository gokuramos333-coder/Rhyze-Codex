// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  NewProgramBadge,
  isNewProgram,
} from '@/components/catalog/NewProgramBadge';

describe('new program badge', () => {
  it('highlights Work & Tone, Mommy & Me, and POUND', () => {
    expect(isNewProgram('work-tone-mswoy36a')).toBe(true);
    expect(isNewProgram('mommy-and-me-dennisse')).toBe(true);
    expect(isNewProgram('pound-mackenzie')).toBe(true);

    render(<NewProgramBadge slug="mommy-and-me-dennisse" />);
    expect(screen.getByText('NEW!')).toBeTruthy();
  });

  it('renders nothing for an established format', () => {
    const { container } = render(<NewProgramBadge slug="rhyze-up-vanessa" />);
    expect(container.innerHTML).toBe('');
  });
});
