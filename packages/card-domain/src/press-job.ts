export type PressStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'READY_TO_CLAIM'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REVOKED';
export const reservedPressStatuses = [
  'ACTIVE',
  'PAUSED',
  'READY_TO_CLAIM',
] as const;
export function pressCommand(
  status: PressStatus,
  progress: number,
  action: 'PAUSE' | 'RESUME' | 'CANCEL' | 'REVOKE',
  cancelAfterProgress: 'DISABLED' | 'FORFEIT_SCREEN',
): { status: PressStatus; screen: 'ASSIGNED' | 'AVAILABLE' | 'REVOKED' } {
  if (
    !Number.isSafeInteger(progress) ||
    progress < 0 ||
    !reservedPressStatuses.some((s) => s === status)
  )
    throw new Error('INVALID_PRESS_TRANSITION');
  if (action === 'PAUSE' && status === 'ACTIVE')
    return { status: 'PAUSED', screen: 'ASSIGNED' };
  if (action === 'RESUME' && status === 'PAUSED')
    return { status: 'ACTIVE', screen: 'ASSIGNED' };
  if (action === 'REVOKE') return { status: 'REVOKED', screen: 'REVOKED' };
  if (
    action === 'CANCEL' &&
    (progress === 0 || cancelAfterProgress === 'FORFEIT_SCREEN')
  )
    return {
      status: 'CANCELLED',
      screen: progress === 0 ? 'AVAILABLE' : 'REVOKED',
    };
  throw new Error('INVALID_PRESS_TRANSITION');
}
