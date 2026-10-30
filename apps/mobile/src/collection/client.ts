import { watchSpades } from '../play/spades-watch';
import {
  privateCardsSchema,
  fusionPolicyResponseSchema,
  fusionSelectionSchema,
  fusionPreviewSchema,
  fusionConfirmSchema,
  fusionReceiptSchema,
  fusionLineageSchema,
  spadesRoomViewSchema,
  spadesPolicyResponseSchema,
  spadesStartSchema,
  spadesCommandSchema,
  spadesReceiptSchema,
  type SpadesCommand,
  type SpadesRoomView,
  lobbyResultSchema,
  gameStartSchema,
  gameStartResponseSchema,
  lobbyCommandSchema,
  pokerRoomViewSchema,
  type LobbyCommand,
  profileSchema,
  cardHistoryResponseSchema,
  currentLoadoutSchema,
  loadoutSavedSchema,
  favoriteResponseSchema,
  archiveResponseSchema,
  albumResponseSchema,
  type OwnedCard,
} from '@deckforge/contracts';
export class CollectionError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? 'Session expired. Reconnect your account.'
        : status === 409
          ? 'Your collection changed. Refresh before trying again.'
          : status === 429
            ? 'Please wait a moment before trying again.'
            : 'Could not complete that request. Try again.',
    );
  }
}
export function createCollectionClient(
  apiUrl: string,
  getAccessToken: () => Promise<string>,
  transport: typeof fetch = fetch,
) {
  const base = new URL(apiUrl);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('Invalid API configuration');
  const prefix = apiUrl.replace(/\/$/, '');
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
  ) {
    let token: string;
    try {
      token = await getAccessToken();
    } catch {
      throw new CollectionError(401);
    }
    if (!token) throw new CollectionError(401);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 10000);
    try {
      const response = await transport(prefix + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new CollectionError(response.status);
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  return {
    async fusionPolicy(signal?: AbortSignal) {
      return fusionPolicyResponseSchema.parse(
        await request('/v1/fusion/policy', 'GET', undefined, signal),
      );
    },
    async previewFusion(sourceIds: string[], signal?: AbortSignal) {
      return fusionPreviewSchema.parse(
        await request(
          '/v1/fusion/preview',
          'POST',
          fusionSelectionSchema.parse({ sourceIds }),
          signal,
        ),
      );
    },
    async confirmFusion(
      command: {
        previewId: string;
        previewHash: string;
        commandId: string;
        confirm: true;
      },
      signal?: AbortSignal,
    ) {
      return fusionReceiptSchema.parse(
        await request(
          '/v1/fusion/confirm',
          'POST',
          fusionConfirmSchema.parse(command),
          signal,
        ),
      );
    },
    async fusionLineage(instanceId: string, signal?: AbortSignal) {
      return fusionLineageSchema.parse(
        await request(
          '/v1/fusion/lineage/' + encodeURIComponent(instanceId),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async spadesPolicy(signal?: AbortSignal) {
      return spadesPolicyResponseSchema.parse(
        await request('/v1/spades/policy', 'GET', undefined, signal),
      );
    },
    async startSpades(
      command: { lobbyId: string; commandId: string; rematchOf?: string },
      signal?: AbortSignal,
    ) {
      return gameStartResponseSchema.parse(
        await request(
          '/v1/spades/start',
          'POST',
          spadesStartSchema.parse(command),
          signal,
        ),
      );
    },
    watchSpades(
      gameId: string,
      receive: (view: SpadesRoomView) => void,
      status: (connected: boolean) => void,
    ) {
      return watchSpades(prefix, getAccessToken, gameId, receive, status);
    },
    async spadesGame(gameId: string, signal?: AbortSignal) {
      return spadesRoomViewSchema.parse(
        await request(
          '/v1/games/' + encodeURIComponent(gameId),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async spadesCommand(command: SpadesCommand, signal?: AbortSignal) {
      return spadesReceiptSchema.parse(
        await request(
          '/v1/games/commands',
          'POST',
          spadesCommandSchema.parse(command),
          signal,
        ),
      );
    },
    async startGame(lobbyId: string, commandId: string, signal?: AbortSignal) {
      return gameStartResponseSchema.parse(
        await request(
          '/v1/games/start',
          'POST',
          gameStartSchema.parse({ lobbyId, commandId }),
          signal,
        ),
      );
    },
    async lobby(signal?: AbortSignal) {
      return lobbyResultSchema.parse(
        await request('/v1/lobby', 'GET', undefined, signal),
      );
    },
    async lobbyCommand(command: LobbyCommand, signal?: AbortSignal) {
      return lobbyResultSchema.parse(
        await request(
          '/v1/lobby/commands',
          'POST',
          lobbyCommandSchema.parse(command),
          signal,
        ),
      );
    },
    async game(gameId: string, signal?: AbortSignal) {
      if (!/^[a-f0-9-]{36}$/i.test(gameId)) throw new Error('Invalid game ID');
      return pokerRoomViewSchema.parse(
        await request(
          '/v1/games/' + encodeURIComponent(gameId),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async bootstrap(signal?: AbortSignal) {
      return profileSchema.parse(
        await request('/v1/auth/session', 'POST', {}, signal),
      );
    },
    async archive(
      view: 'all' | 'current' | 'former' = 'all',
      cursor?: string,
      signal?: AbortSignal,
    ) {
      return archiveResponseSchema.parse(
        await request(
          '/v1/collection/archive?limit=50&view=' +
            view +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async album(cursor?: string, signal?: AbortSignal) {
      return albumResponseSchema.parse(
        await request(
          '/v1/collection/album?limit=10' +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async list(cursor?: string, signal?: AbortSignal) {
      return privateCardsSchema.parse(
        await request(
          '/v1/cards?limit=100' +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async history(instanceId: string, afterVersion = 0, signal?: AbortSignal) {
      return cardHistoryResponseSchema.parse(
        await request(
          '/v1/cards/' +
            encodeURIComponent(instanceId) +
            '/provenance?limit=25&afterVersion=' +
            afterVersion,
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async currentLoadout(signal?: AbortSignal) {
      return currentLoadoutSchema.parse(
        await request('/v1/loadouts/current', 'GET', undefined, signal),
      );
    },
    async favorite(instanceId: string, favorite: boolean) {
      return favoriteResponseSchema.parse(
        await request(
          '/v1/cards/' + encodeURIComponent(instanceId) + '/favorite',
          'PUT',
          { favorite },
        ),
      );
    },
    async equip(command: {
      id: string;
      expectedVersion: number;
      idempotencyKey: string;
      faceToInstanceIds: Record<string, string>;
    }) {
      const { id, ...body } = command;
      return loadoutSavedSchema.parse(
        await request('/v1/loadouts/' + encodeURIComponent(id), 'PUT', body),
      );
    },
  };
}
export type CollectionClient = ReturnType<typeof createCollectionClient>;
export type CollectionConnection = {
  apiUrl: string;
  sessionKey: string;
  getAccessToken: () => Promise<string>;
};
export type { OwnedCard };
