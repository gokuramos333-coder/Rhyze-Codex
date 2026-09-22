import type { Mode } from './guards';

export type ReleaseSteps = Record<
  | 'prepare'
  | 'localChecks'
  | 'preflight'
  | 'snapshotCheck'
  | 'databaseBinding'
  | 'recheck'
  | 'deploy'
  | 'verify'
  | 'databaseLocked',
  () => Promise<void>
>;
export type ReleaseReport = {
  status:
    | 'BLOCKED'
    | 'CHECKED_NOT_DEPLOYED'
    | 'REQUIRES_ATTENTION'
    | 'VERIFIED';
  completed: string[];
  failedStep?: string;
  publicationAttempted: boolean;
  published: boolean;
};

// Fail closed. A publish failure may have reached the provider; never retry or
// roll back automatically (a release can include irreversible SQL migrations).
export async function runRelease(
  mode: Mode,
  steps: ReleaseSteps,
  progress: (report: ReleaseReport) => void = () => {},
) {
  const report: ReleaseReport = {
    status: 'BLOCKED',
    completed: [],
    publicationAttempted: false,
    published: false,
  };
  const sequence: (keyof ReleaseSteps)[] =
    mode === 'verify'
      ? ['verify', 'databaseLocked']
      : ['prepare', 'localChecks', 'preflight', 'snapshotCheck'];
  if (mode === 'publish')
    sequence.push(
      'databaseBinding',
      'recheck',
      'deploy',
      'verify',
      'databaseLocked',
    );
  for (const step of sequence) {
    if (step === 'deploy') report.publicationAttempted = true;
    progress(report);
    try {
      await steps[step]();
      report.completed.push(step);
      if (step === 'deploy') report.published = true;
    } catch {
      report.failedStep = step;
      report.status =
        report.publicationAttempted || mode === 'verify'
          ? 'REQUIRES_ATTENTION'
          : 'BLOCKED';
      progress(report);
      return report;
    }
  }
  report.status = mode === 'check' ? 'CHECKED_NOT_DEPLOYED' : 'VERIFIED';
  progress(report);
  return report;
}
