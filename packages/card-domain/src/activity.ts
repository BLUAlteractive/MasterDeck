export type CanonicalInterval = {
  start: number;
  end: number;
  steps: number;
  manual: boolean;
  deleted: boolean;
};
/** Whole overlapping intervals are excluded; no invented proportional steps or device totals. */
export function activityRejection(
  record: CanonicalInterval,
  accepted: readonly { start: number; end: number }[],
  policy: { maxStepsPerMinute: number; lookbackHours: number },
  now: number,
  withdrawal: number | null,
): string | null {
  if (record.deleted) return 'DELETED_SOURCE';
  if (record.manual) return 'MANUAL_ENTRY';
  if (
    !Number.isSafeInteger(record.steps) ||
    record.steps < 1 ||
    record.steps > 200000 ||
    !Number.isFinite(record.start) ||
    !Number.isFinite(record.end) ||
    record.end <= record.start ||
    record.end > now ||
    record.start < now - policy.lookbackHours * 3600000
  )
    return 'INVALID_INTERVAL';
  if (withdrawal !== null && record.start < withdrawal) return 'PRIVACY_CUTOFF';
  if (
    new Date(record.start).toISOString().slice(0, 10) !==
    new Date(record.end - 1).toISOString().slice(0, 10)
  )
    return 'UTC_DAY_BOUNDARY';
  if (
    record.steps * 60000 >
    (record.end - record.start) * policy.maxStepsPerMinute
  )
    return 'IMPLAUSIBLE_RATE';
  if (accepted.some((s) => record.start < s.end && s.start < record.end))
    return 'OVERLAPPING_INTERVAL';
  return null;
}
export function activityCreditTarget(
  acceptedSteps: number,
  policy: { stepsPerCredit: number; dailyCreditCap: number },
) {
  if (
    !Number.isSafeInteger(acceptedSteps) ||
    acceptedSteps < 0 ||
    !Number.isSafeInteger(policy.stepsPerCredit) ||
    policy.stepsPerCredit < 1 ||
    !Number.isSafeInteger(policy.dailyCreditCap) ||
    policy.dailyCreditCap < 1
  )
    throw new Error('INVALID_ACTIVITY_POLICY');
  return Math.min(
    policy.dailyCreditCap,
    Math.floor(acceptedSteps / policy.stepsPerCredit),
  );
}
