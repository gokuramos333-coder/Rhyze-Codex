import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin manual credit grant surface', () => {
  it('lets admin users grant paid credits with custom expiration and audit trail', () => {
    const action = readFileSync(
      'app/(studio)/admin/members/[userId]/actions.ts',
      'utf8',
    );
    const profile = readFileSync(
      'app/(studio)/admin/members/[userId]/page.tsx',
      'utf8',
    );

    expect(action).toContain('grantManualMemberCreditsAction');
    expect(action).toContain('updateManualMemberCreditsAction');
    expect(action).toContain('deleteManualMemberCreditsAction');
    expect(action).toContain("creditKind: z.enum(['CLASS', 'EVENT'])");
    expect(action).toContain("creditKind: formData.get('creditKind')");
    expect(action).toContain('manualCreditLabel(creditKind, expirationDate)');
    expect(action).toContain("requireArea('admin')");
    expect(action).toContain("type: 'GRANT'");
    expect(action).toContain("type: 'ADJUSTMENT'");
    expect(action).toContain("action: 'credit.manual-grant'");
    expect(action).toContain("action: 'credit.manual-update'");
    expect(action).toContain("action: 'credit.manual-delete'");
    expect(action).toContain('manualCreditValidUntil(expirationDate)');
    expect(action).toContain('validUntil <= validFrom');
    expect(action).toContain('validUntil <= changedAt');
    expect(action).toContain('quantity - currentBalance');

    expect(profile).toContain('action={grantManualMemberCreditsAction}');
    expect(profile).toContain('name="quantity"');
    expect(profile).toContain('name="creditKind"');
    expect(profile).toContain('<option value="CLASS">Class credit</option>');
    expect(profile).toContain('<option value="EVENT">Event credit</option>');
    expect(profile).toContain('name="expirationDate"');
    expect(profile).toContain('name="reason"');
    expect(profile).toContain('Grant credits');
    expect(profile).toContain('Manual admin grant');
    expect(profile).toContain('click to edit amount or expiration');
    expect(profile).toContain('action={updateManualMemberCreditsAction}');
    expect(profile).toContain('action={deleteManualMemberCreditsAction}');
    expect(profile).toContain('name="creditAccountId"');
    expect(profile).toContain('defaultValue={manualCreditKindForLabel(credit.label)}');
    expect(profile).toContain('Update credit');
    expect(profile).toContain('defaultValue={dateInputValue(credit.validUntil)}');
    expect(profile).toContain('manualCreditReason(credit.entries)');
    expect(profile).toContain('DeleteManualCreditForm');
  });
});
