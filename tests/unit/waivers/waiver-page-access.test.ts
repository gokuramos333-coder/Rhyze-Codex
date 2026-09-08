import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('member waiver page access and copy', () => {
  const pageSource = readFileSync(
    'app/(portal)/member/waiver/page.tsx',
    'utf8',
  );
  const actionSource = readFileSync(
    'app/(portal)/member/actions.ts',
    'utf8',
  );

  it('does not show an internal waiver version number to members', () => {
    expect(pageSource).not.toContain('Version {activeWaiver.version}');
  });

  it('requires the signed-in member account on both page load and acceptance', () => {
    expect(pageSource).toContain("requireArea('member')");
    expect(actionSource).toContain(
      'export async function acceptWaiverAction(formData: FormData)',
    );
    const acceptanceAction = actionSource.slice(
      actionSource.indexOf(
        'export async function acceptWaiverAction(formData: FormData)',
      ),
    );
    expect(acceptanceAction).toContain("requireArea('member')");
    expect(acceptanceAction).toContain('userId: user.id');
  });

  it('makes the required waiver and cancellation policy signature box obvious', () => {
    expect(pageSource).toContain('Required signature box');
    expect(pageSource).toContain('Check this box to sign');
    expect(pageSource).toContain('h-7 w-7');
    expect(pageSource).toContain('waiver, electronic signature terms, and cancellation policy');
    expect(pageSource).toContain('Accept waiver and cancellation policy');
  });
});
