// The provider may have accepted a failed/uncertain publish response. Never retry.
// Cleanup steps are independent: a failed approval deletion cannot skip the lock.
async function runHostedWorkflow(steps, progress = () => {}) {
  const result = {
    status: 'BLOCKED',
    publicationAttempted: false,
    completed: [],
    failures: [],
  };
  for (const name of ['prepare', 'publish', 'lock', 'verify']) {
    try {
      if (name === 'publish') result.publicationAttempted = true;
      progress(result);
      await steps[name]();
      result.completed.push(name);
    } catch {
      result.failures.push(name);
      break;
    }
  }
  for (const name of ['removeApproval', 'ensureLocked', 'patOff']) {
    try {
      await steps[name]();
      result.completed.push(name);
    } catch {
      result.failures.push(name);
    }
  }
  result.status = !result.failures.length
    ? 'VERIFIED'
    : result.publicationAttempted ||
        result.failures.some((name) =>
          ['removeApproval', 'ensureLocked', 'patOff'].includes(name),
        )
      ? 'REQUIRES_ATTENTION'
      : 'BLOCKED';
  progress(result);
  return result;
}
module.exports = { runHostedWorkflow };
