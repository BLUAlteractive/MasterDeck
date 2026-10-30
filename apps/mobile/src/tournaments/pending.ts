export type TournamentIntent =
  | { action: 'REGISTER'; tournamentId: string }
  | { action: 'READY'; tournamentId: string; matchId: string; attempt: number }
  | {
      action: 'REPORT';
      tournamentId: string;
      matchId: string;
      code: 'RESULT_INCONSISTENT' | 'CONNECTION_FAILURE' | 'COLLUSION';
    };
export type PendingTournamentAction = Readonly<{
  intent: TournamentIntent;
  commandId: string;
  fingerprint: string;
}>;
/** Retain an ambiguous action across refresh/reconnect; never turn a retry into a new command. */
export function stageTournamentAction(
  pending: PendingTournamentAction | null,
  intent: TournamentIntent,
  makeId: () => string,
): PendingTournamentAction {
  const fingerprint = JSON.stringify(intent);
  if (pending) {
    if (pending.fingerprint !== fingerprint) throw new Error('ACTION_PENDING');
    return pending;
  }
  return { intent, commandId: makeId(), fingerprint };
}
