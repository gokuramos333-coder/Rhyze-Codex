export type SombleInviteCandidate = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  hasPassword: boolean;
};

export type SombleInviteDependencies = {
  listCandidates(): Promise<SombleInviteCandidate[]>;
  issueClaim(userId: string): Promise<{ rawToken: string; expiresAt: Date }>;
  queueInvite(input: {
    userId: string;
    email: string;
    name: string | null;
    activationUrl: string;
    expiresAt: Date;
  }): Promise<void>;
};

type SkipReason = 'already-active' | 'non-member-role' | 'not-invited' | 'has-password';

export type SombleInviteReport = {
  mode: 'dry-run' | 'apply';
  candidates: number;
  eligible: number;
  queued: number;
  skipped: number;
  skippedAccounts: Array<{ email: string; reason: SkipReason }>;
};

export function parseSombleInviteMode(args: string[]): { apply: boolean } {
  return { apply: args.includes('--apply') };
}

function skipReason(candidate: SombleInviteCandidate): SkipReason | null {
  if (candidate.role !== 'MEMBER') return 'non-member-role';
  if (candidate.status === 'ACTIVE') return 'already-active';
  if (candidate.status !== 'INVITED') return 'not-invited';
  if (candidate.hasPassword) return 'has-password';
  return null;
}

export async function runSombleAccountInviteBatch(
  options: { apply: boolean },
  dependencies: SombleInviteDependencies,
): Promise<SombleInviteReport> {
  const candidates = await dependencies.listCandidates();
  const eligible: SombleInviteCandidate[] = [];
  const skippedAccounts: Array<{ email: string; reason: SkipReason }> = [];

  for (const candidate of candidates) {
    const reason = skipReason(candidate);
    if (reason) skippedAccounts.push({ email: candidate.email, reason });
    else eligible.push(candidate);
  }

  let queued = 0;
  if (options.apply) {
    for (const candidate of eligible) {
      const claim = await dependencies.issueClaim(candidate.id);
      await dependencies.queueInvite({
        userId: candidate.id,
        email: candidate.email,
        name: candidate.name,
        activationUrl: `/claim-account/${encodeURIComponent(claim.rawToken)}`,
        expiresAt: claim.expiresAt,
      });
      queued += 1;
    }
  }

  return {
    mode: options.apply ? 'apply' : 'dry-run',
    candidates: candidates.length,
    eligible: eligible.length,
    queued,
    skipped: skippedAccounts.length,
    skippedAccounts,
  };
}
