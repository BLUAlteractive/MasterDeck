import {
  packCancelResultSchema,
  pendingPackSchema,
  packCatalogSchema,
  packOpeningSchema,
  packOpenSchema,
  packHistoryQuerySchema,
  packHistorySchema,
  supplyViewSchema,
  fixedPackQuerySchema,
  fixedPackOfferSchema,
  walletViewSchema,
  privacyStateSchema,
  privacyConsentSchema,
  privacyConsentReceiptSchema,
  privacyExportSchema,
  privacyExportQuerySchema,
  privacyDeleteSchema,
  privacyDeleteReceiptSchema,
} from '@deckforge/contracts';
import { watchPoker } from '../play/poker-watch';
import { watchSpades } from '../play/spades-watch';
import {
  tournamentIdSchema,
  tournamentListQuerySchema,
  tournamentListSchema,
  tournamentViewSchema,
  tournamentCommandSchema,
  tournamentReadySchema,
  tournamentReadyResultSchema,
  tournamentRegistrationReceiptSchema,
  tournamentDisputeSchema,
  tournamentDisputeReceiptSchema,
  pokerCommandSchema,
  pokerCommandReceiptSchema,
  type PokerRoomCommand,
  safetyContextSchema,
  safetyCommandSchema,
  safetyViewSchema,
  safetyReceiptSchema,
  type SafetyCommand,
  privateCardsSchema,
  billingProofSchema,
  billingContextSchema,
  billingReceiptSchema,
  purchaseViewSchema,
  purchaseHistorySchema,
  type BillingProof,
  storefrontViewSchema,
  cosmeticInventorySchema,
  accessibleViewSchema,
  accessibleStartResponseSchema,
  accessibleReceiptSchema,
  accessibleStartSchema,
  accessibleCommandSchema,
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
    apiOrigin: base.origin,
    async packs(platform: 'APPLE' | 'GOOGLE', signal?: AbortSignal) {
      return packCatalogSchema.parse(
        await request(
          '/v1/packs/catalog?platform=' + platform,
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async openPack(
      packId: string,
      input: ReturnType<typeof packOpenSchema.parse>,
      signal?: AbortSignal,
    ) {
      const pending = pendingPackSchema.parse({ packId, command: input });
      const receipt = packOpeningSchema.parse(
        await request(
          '/v1/packs/' + encodeURIComponent(pending.packId) + '/open',
          'POST',
          pending.command,
          signal,
        ),
      );
      if (
        receipt.packId !== packId ||
        receipt.definitionHash !== input.expectedDefinitionHash
      )
        throw new Error('Pack receipt does not match the requested offer.');
      return receipt;
    },
    async cancelPack(
      input: ReturnType<typeof pendingPackSchema.parse>,
      signal?: AbortSignal,
    ) {
      return packCancelResultSchema.parse(
        await request(
          '/v1/packs/cancel',
          'POST',
          pendingPackSchema.parse(input),
          signal,
        ),
      );
    },
    async packHistory(cursor?: string, signal?: AbortSignal) {
      const q = packHistoryQuerySchema.parse({ cursor, limit: 20 });
      return packHistorySchema.parse(
        await request(
          '/v1/packs/openings?limit=20' +
            (q.cursor ? '&cursor=' + q.cursor : ''),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async supplies(signal?: AbortSignal) {
      return supplyViewSchema.parse(
        await request('/v1/packs/supplies', 'GET', undefined, signal),
      );
    },
    async fixedPackOffer(
      packId: string,
      query: ReturnType<typeof fixedPackQuerySchema.parse>,
      signal?: AbortSignal,
    ) {
      const q = fixedPackQuerySchema.parse(query);
      return fixedPackOfferSchema.parse(
        await request(
          '/v1/packs/' +
            encodeURIComponent(packId) +
            '/fixed-offer?platform=' +
            q.platform +
            '&expectedDefinitionHash=' +
            q.expectedDefinitionHash,
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async wallets() {
      return walletViewSchema.parse(await request('/v1/wallets'));
    },
    async privacyState() {
      return privacyStateSchema.parse(await request('/v1/privacy'));
    },
    async privacyConsent(input: ReturnType<typeof privacyConsentSchema.parse>) {
      return privacyConsentReceiptSchema.parse(
        await request(
          '/v1/privacy/consent',
          'POST',
          privacyConsentSchema.parse(input),
        ),
      );
    },
    async privacyExport(
      input: Omit<
        ReturnType<typeof privacyExportQuerySchema.parse>,
        'limit'
      > & { limit?: number },
    ) {
      const q = privacyExportQuerySchema.parse(input);
      return privacyExportSchema.parse(
        await request(
          '/v1/privacy/export?' +
            new URLSearchParams({
              resource: q.resource,
              limit: String(q.limit),
              ...(q.cursor ? { cursor: q.cursor } : {}),
            }),
        ),
      );
    },
    async privacyDelete(input: ReturnType<typeof privacyDeleteSchema.parse>) {
      return privacyDeleteReceiptSchema.parse(
        await request(
          '/v1/privacy/deletion',
          'POST',
          privacyDeleteSchema.parse(input),
        ),
      );
    },
    async safety(
      game: 'POKER' | 'SPADES',
      gameId: string,
      signal?: AbortSignal,
    ) {
      const c = safetyContextSchema.parse({ game, gameId });
      return safetyViewSchema.parse(
        await request(
          '/v1/safety/rooms/' + c.game + '/' + c.gameId,
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async safetyCommand(command: SafetyCommand, signal?: AbortSignal) {
      return safetyReceiptSchema.parse(
        await request(
          '/v1/safety/commands',
          'POST',
          safetyCommandSchema.parse(command),
          signal,
        ),
      );
    },
    async tournaments(cursor?: string, signal?: AbortSignal) {
      const q = tournamentListQuerySchema.parse({
        limit: 10,
        ...(cursor ? { cursor } : {}),
      });
      return tournamentListSchema.parse(
        await request(
          '/v1/tournaments?limit=10' +
            (q.cursor ? '&cursor=' + encodeURIComponent(q.cursor) : ''),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async tournament(id: string, signal?: AbortSignal) {
      tournamentIdSchema.parse(id);
      const value = tournamentViewSchema.parse(
        await request(
          '/v1/tournaments/' + encodeURIComponent(id),
          'GET',
          undefined,
          signal,
        ),
      );
      if (value.id !== id) throw new Error('WRONG_TOURNAMENT');
      return value;
    },
    async registerTournament(
      id: string,
      commandId: string,
      signal?: AbortSignal,
    ) {
      tournamentIdSchema.parse(id);
      return tournamentRegistrationReceiptSchema.parse(
        await request(
          '/v1/tournaments/' + encodeURIComponent(id) + '/register',
          'POST',
          tournamentCommandSchema.parse({ commandId }),
          signal,
        ),
      );
    },
    async readyTournament(
      matchId: string,
      attempt: number,
      commandId: string,
      signal?: AbortSignal,
    ) {
      tournamentIdSchema.parse(matchId);
      return tournamentReadyResultSchema.parse(
        await request(
          '/v1/tournaments/matches/' + encodeURIComponent(matchId) + '/ready',
          'POST',
          tournamentReadySchema.parse({ commandId, attempt }),
          signal,
        ),
      );
    },
    async reportTournament(
      id: string,
      command: {
        commandId: string;
        matchId: string;
        code: 'RESULT_INCONSISTENT' | 'CONNECTION_FAILURE' | 'COLLUSION';
      },
      signal?: AbortSignal,
    ) {
      tournamentIdSchema.parse(id);
      return tournamentDisputeReceiptSchema.parse(
        await request(
          '/v1/tournaments/' + encodeURIComponent(id) + '/reports',
          'POST',
          tournamentDisputeSchema.parse(command),
          signal,
        ),
      );
    },
    watchPoker(
      gameId: string,
      receive: Parameters<typeof watchPoker>[3],
      status: Parameters<typeof watchPoker>[4],
    ) {
      return watchPoker(prefix, getAccessToken, gameId, receive, status);
    },
    async pokerCommand(command: PokerRoomCommand, signal?: AbortSignal) {
      const c = pokerCommandSchema.parse(command),
        receipt = pokerCommandReceiptSchema.parse(
          await request('/v1/games/commands', 'POST', c, signal),
        );
      if (receipt.gameId !== c.gameId || receipt.commandId !== c.commandId)
        throw new Error('WRONG_COMMAND_RECEIPT');
      return receipt;
    },
    async billingContext(signal?: AbortSignal) {
      return billingContextSchema.parse(
        await request('/v1/billing/context', 'GET', undefined, signal),
      );
    },
    async verifyPurchase(proof: BillingProof, signal?: AbortSignal) {
      return billingReceiptSchema.parse(
        await request(
          '/v1/billing/verify',
          'POST',
          billingProofSchema.parse(proof),
          signal,
        ),
      );
    },
    async restorePurchase(proof: BillingProof, signal?: AbortSignal) {
      return purchaseViewSchema.parse(
        await request(
          '/v1/billing/restore',
          'POST',
          billingProofSchema.parse(proof),
          signal,
        ),
      );
    },
    async purchaseHistory(cursor?: string, signal?: AbortSignal) {
      return purchaseHistorySchema.parse(
        await request(
          '/v1/billing/purchases?limit=25' +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async storefront(platform: 'APPLE' | 'GOOGLE', signal?: AbortSignal) {
      return storefrontViewSchema.parse(
        await request(
          '/v1/storefront?platform=' + platform,
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async cosmetics(cursor?: string, signal?: AbortSignal) {
      return cosmeticInventorySchema.parse(
        await request(
          '/v1/cosmetics?limit=50' +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          'GET',
          undefined,
          signal,
        ),
      );
    },
    async accessibleQuests(signal?: AbortSignal) {
      return accessibleViewSchema.parse(
        await request('/v1/accessibility/quests', 'GET', undefined, signal),
      );
    },
    async startAccessible(
      command: { goalId: string; commandId: string },
      signal?: AbortSignal,
    ) {
      return accessibleStartResponseSchema.parse(
        await request(
          '/v1/accessibility/quests/start',
          'POST',
          accessibleStartSchema.parse(command),
          signal,
        ),
      );
    },
    async claimAccessible(
      command: { enrollmentId: string; commandId: string },
      signal?: AbortSignal,
    ) {
      return accessibleReceiptSchema.parse(
        await request(
          '/v1/accessibility/quests/claim',
          'POST',
          accessibleCommandSchema.parse(command),
          signal,
        ),
      );
    },
    async cancelAccessible(
      command: { enrollmentId: string; commandId: string },
      signal?: AbortSignal,
    ) {
      return accessibleStartResponseSchema.parse(
        await request(
          '/v1/accessibility/quests/cancel',
          'POST',
          accessibleCommandSchema.parse(command),
          signal,
        ),
      );
    },
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
  onDeletionAccepted?: (requestId: string) => Promise<void>;
};
export type { OwnedCard };
