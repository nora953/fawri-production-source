import { once } from 'node:events';

// Attempt every cleanup even after one fails. Keep raw driver errors out of CI logs.
export async function cleanupResources(resources) {
  const failures = [];
  for (const [name, cleanup] of resources) {
    try { await cleanup(); }
    catch { failures.push(new Error(`Test cleanup failed: ${name}`)); }
  }
  if (failures.length) {
    // node:test may report only the original setup failure and omit a failing
    // after hook. Emit bounded metadata so cleanup failure remains observable.
    console.error('TEST_CLEANUP_FAILURE ' + JSON.stringify({ failedResources: failures.length }));
    throw new AggregateError(failures, `Test cleanup failed for ${failures.length} resource(s)`);
  }
}

export async function stopTestChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { child.kill('SIGTERM'); await exited; }
  finally { clearTimeout(timer); }
}
