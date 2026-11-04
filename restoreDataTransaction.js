/**
 * Commit an account-scoped restore while holding the same local-data queue used
 * by account activation. A failed write restores the pre-operation values before
 * another owner can become active.
 */
const commitRestoreData = async ({
  runScopeBoundOperation,
  expectedGeneration,
  isCurrent,
  write,
  snapshotEntry,
  current,
  next,
}) => runScopeBoundOperation(expectedGeneration, isCurrent, async () => {
  const currentValues = typeof current === 'function' ? current() : current;
  const nextValues = typeof next === 'function' ? next(currentValues) : next;
  const snapshotValue = typeof snapshotEntry?.value === 'function' ? snapshotEntry.value(currentValues) : snapshotEntry?.value;
  if (snapshotEntry && !(await write(snapshotEntry.key, snapshotValue))) {
    return { ok: false, stage: 'snapshot', rollbackOk: true };
  }

  const keys = Object.keys(nextValues);
  for (const key of keys) {
    if (await write(key, nextValues[key])) continue;

    let rollbackOk = true;
    for (const rollbackKey of keys) {
      if (!(await write(rollbackKey, currentValues[rollbackKey]))) rollbackOk = false;
    }
    return { ok: false, stage: 'data', rollbackOk };
  }

  return { ok: true, current: currentValues, next: nextValues };
});

// A failed rollback cannot promise that the previously active data was preserved.
const restoreFailureReason = (result) => result?.rollbackOk === false ? 'other' : 'storage';

module.exports = { commitRestoreData, restoreFailureReason };
