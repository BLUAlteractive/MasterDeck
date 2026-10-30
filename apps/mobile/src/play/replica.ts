import {
  pokerCommandSchema,
  pokerCommandReceiptSchema,
  pokerRoomJoinSchema,
  pokerRoomViewSchema,
  pokerResumeResponseSchema,
  type PokerRoomCommand,
} from '@deckforge/contracts';
export type RoomReplica = Readonly<{
  gameId: string;
  snapshot: ReturnType<typeof pokerRoomViewSchema.parse> | null;
  pending: PokerRoomCommand | null;
}>;
export function createReplica(gameId: string): RoomReplica {
  return {
    gameId: pokerRoomJoinSchema.parse({ gameId }).gameId,
    snapshot: null,
    pending: null,
  };
}
export function acceptSnapshot(
  state: RoomReplica,
  input: unknown,
): RoomReplica {
  const next = pokerRoomViewSchema.parse(input);
  if (next.gameId !== state.gameId) throw new Error('WRONG_ROOM');
  if (
    state.snapshot &&
    next.view.stateVersion <= state.snapshot.view.stateVersion
  )
    return state;
  if (
    state.snapshot &&
    next.view.rulesetVersion !== state.snapshot.view.rulesetVersion
  )
    throw new Error('RULESET_CHANGED');
  return { ...state, snapshot: next };
}
/** Retries send this exact pending command; reconnect never invents a new key. */
export function stageCommand(
  state: RoomReplica,
  commandId: string,
  payload: PokerRoomCommand['payload'],
): RoomReplica {
  if (state.pending) throw new Error('COMMAND_PENDING');
  if (!state.snapshot || state.snapshot.view.street === 'COMPLETE')
    throw new Error('NO_ACTIVE_HAND');
  return {
    ...state,
    pending: pokerCommandSchema.parse({
      gameId: state.gameId,
      commandId,
      stateVersion: state.snapshot.view.stateVersion,
      payload,
    }),
  };
}
export function acceptReceipt(state: RoomReplica, input: unknown): RoomReplica {
  const receipt = pokerCommandReceiptSchema.parse(input);
  if (receipt.gameId !== state.gameId) throw new Error('WRONG_ROOM');
  const next = acceptSnapshot(state, {
    gameId: receipt.gameId,
    view: receipt.view,
    turnDeadline: receipt.turnDeadline,
  });
  return {
    ...next,
    pending:
      state.pending?.commandId === receipt.commandId ? null : state.pending,
  };
}
export function rejectCommand(
  state: RoomReplica,
  commandId: string,
): RoomReplica {
  return state.pending?.commandId === commandId
    ? { ...state, pending: null }
    : state;
}

export function acceptResume(state: RoomReplica, input: unknown): RoomReplica {
  const response = pokerResumeResponseSchema.parse(input);
  return acceptSnapshot(state, {
    gameId: response.gameId,
    view: response.view,
    turnDeadline: response.turnDeadline,
  });
}
