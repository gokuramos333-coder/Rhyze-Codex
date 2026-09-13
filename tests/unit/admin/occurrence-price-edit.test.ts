import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin occurrence price editing', () => {
  it('lets admins edit the client-facing drop-in price for a managed class date', () => {
    const managePage = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/page.tsx', 'utf8');
    const actions = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/actions.ts', 'utf8');

    expect(managePage).toContain('Client drop-in price');
    expect(managePage).toContain('name="dropInPrice"');
    expect(managePage).toContain('Current client price');
    expect(actions).toContain("import { parseClassPriceCents } from '@/lib/catalog/class-pricing';");
    expect(actions).toContain("const priceCents = parseClassPriceCents(formData.get('dropInPrice'));");
    expect(actions).toContain('priceCents,');
    expect(actions).toContain("redirect(`/admin/schedule/${id}?error=price`);");
    expect(actions).toContain("revalidatePath(`/schedule/${id}`);");
  });
});
