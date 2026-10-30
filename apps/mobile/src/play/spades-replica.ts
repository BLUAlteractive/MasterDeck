import {
  spadesRoomViewSchema,
  spadesReceiptSchema,
  spadesCommandSchema,
  type SpadesRoomView,
  type SpadesCommand,
} from '@deckforge/contracts';
export type SpadesReplica = Readonly<{
  gameId: string;
  snapshot: SpadesRoomView | null;
  pending: SpadesCommand | null;
}>;
export function acceptSpades(
  state: SpadesReplica,
  input: unknown,
): SpadesReplica {
  const next = spadesRoomViewSchema.parse(input);
  if (next.gameId !== state.gameId) throw new Error('WRONG_ROOM');
  if (
    state.snapshot &&
    next.view.rulesetVersion !== state.snapshot.view.rulesetVersion
  )
    throw new Error('RULESET_CHANGED');
  return state.snapshot &&
    next.view.stateVersion <= state.snapshot.view.stateVersion
    ? state
    : { ...state, snapshot: next };
}
export function stageSpades(
  state: SpadesReplica,
  commandId: string,
  payload: SpadesCommand['payload'],
): SpadesReplica {
  if (state.pending || !state.snapshot) throw new Error('COMMAND_UNAVAILABLE');
  return {
    ...state,
    pending: spadesCommandSchema.parse({
      gameId: state.gameId,
      commandId,
      stateVersion: state.snapshot.view.stateVersion,
      payload,
    }),
  };
}
export function receiptSpades(
  state: SpadesReplica,
  input: unknown,
): SpadesReplica {
  const receipt = spadesReceiptSchema.parse(input);
  return {
    ...acceptSpades(state, {
      gameId: receipt.gameId,
      view: receipt.view,
      settled: receipt.settled,
      turnDeadline: null,
    }),
    pending:
      state.pending?.commandId === receipt.commandId ? null : state.pending,
  };
}
