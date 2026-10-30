import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import {
  lobbyCommandSchema,
  pokerRulesVersions,
  lobbyResultSchema,
  type LobbyResult,
} from '@deckforge/contracts';
import { validateLoadout } from '@deckforge/card-domain';
import type { Prisma, PrismaClient } from '@deckforge/database';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import type { ClassicAdmissionPolicy } from './settlement';
import { lockPrincipal, hash, json } from './shared';
const inviteHash = (s: string) => createHash('sha256').update(s).digest('hex');
export class LobbyService {
  constructor(
    readonly database: PrismaClient,
    readonly policy: ClassicAdmissionPolicy | null = null,
  ) {}
  private async view(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<LobbyResult> {
    const own = await tx.lobbySeat.findUnique({
      where: { userId },
      include: { lobby: { include: { seats: { orderBy: { seat: 'asc' } } } } },
    });
    if (!own) return { lobby: null, invite: null };
    const l = own.lobby;
    const admission = await tx.gameAdmission.findUnique({
      where: { lobbyId: l.id },
      select: { roomId: true },
    });
    const accounts = this.policy
      ? await tx.playChipAccount.findMany({
          where: { userId: { in: l.seats.map((s) => s.userId) } },
        })
      : [];
    const canStart =
      l.mode === 'CLASSIC' &&
      l.rulesetVersion === pokerRulesVersions.CLASSIC &&
      !!this.policy &&
      l.status === 'OPEN' &&
      l.hostId === userId &&
      l.seats.length >= 2 &&
      l.seats.every(
        (s) =>
          s.ready &&
          accounts.some(
            (a) =>
              a.userId === s.userId && a.balance >= BigInt(this.policy!.buyIn),
          ),
      );
    return lobbyResultSchema.parse({
      lobby: {
        id: l.id,
        kind: l.kind,
        mode: l.mode,
        status: l.status,
        rulesetVersion: l.rulesetVersion,
        admission:
          l.mode === 'EVOLVED'
            ? 'BALANCE_REVIEW_REQUIRED'
            : this.policy
              ? 'AVAILABLE'
              : 'POLICY_NOT_CONFIGURED',
        capacity: l.capacity,
        hostId: l.hostId,
        version: l.version,
        members: l.seats.map((s) => ({
          userId: s.userId,
          seat: s.seat,
          ready: s.ready,
        })),
        canStart,
        gameId: admission?.roomId ?? null,
      },
      invite: null,
    });
  }
  async read(p: Principal) {
    return this.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(42819)::text`;
      return this.view(tx, p.userId);
    });
  }
  async command(p: Principal, body: unknown) {
    const parsed = lobbyCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    const result = await this.database.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        // Shared across processes; no other account locks are acquired after this matchmaking mutex.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(42819)::text`;
        const prior = await tx.operationRecord.findUnique({
          where: {
            userId_operation_key: {
              userId: p.userId,
              operation: 'LOBBY',
              key: input.commandId,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== hash(input))
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return lobbyResultSchema.parse(prior.result);
        }
        const own = await tx.lobbySeat.findUnique({
          where: { userId: p.userId },
        });
        if (
          own &&
          (await tx.lobby.findUniqueOrThrow({ where: { id: own.lobbyId } }))
            .status !== 'OPEN'
        )
          throw new ApiFailure('GAME_IN_PROGRESS', 409);

        let invite: string | null = null;
        if (input.action === 'LEAVE') {
          if (own) {
            const lobby = await tx.lobby.findUniqueOrThrow({
              where: { id: own.lobbyId },
            });
            if (lobby.hostId === p.userId) {
              await tx.lobbySeat.deleteMany({ where: { lobbyId: lobby.id } });
              await tx.lobby.update({
                where: { id: lobby.id },
                data: { status: 'CLOSED', version: { increment: 1 } },
              });
            } else {
              await tx.lobbySeat.delete({ where: { userId: p.userId } });
              await tx.lobbySeat.updateMany({
                where: { lobbyId: lobby.id },
                data: { ready: false },
              });
              await tx.lobby.update({
                where: { id: lobby.id },
                data: { version: { increment: 1 } },
              });
            }
          }
        } else if (input.action === 'READY') {
          if (!own) throw new ApiFailure('LOBBY_UNAVAILABLE', 404);
          if (input.ready) {
            const loadout = await tx.loadout.findUnique({
              where: { userId: p.userId },
              include: { cards: true },
            });
            const ids = loadout?.cards.map((c) => c.instanceId) ?? [];
            await tx.$queryRaw`SELECT "id" FROM "CardInstance" WHERE "ownerId"=${p.userId}::uuid AND "id"=ANY(${ids}::uuid[]) ORDER BY "id" FOR SHARE`;
            const cards = await tx.cardInstance.findMany({
              where: { id: { in: ids }, ownerId: p.userId },
            });
            if (
              !loadout ||
              !validateLoadout(
                p.userId,
                Object.fromEntries(
                  loadout.cards.map((c) => [c.faceId, c.instanceId]),
                ),
                cards,
              ).valid
            )
              throw new ApiFailure('INVALID_LOADOUT', 422);
          }
          await tx.lobbySeat.update({
            where: { userId: p.userId },
            data: { ready: input.ready },
          });
          await tx.lobby.update({
            where: { id: own.lobbyId },
            data: { version: { increment: 1 } },
          });
        } else {
          if (own) throw new ApiFailure('ALREADY_SEATED', 409);
          let lobby;
          if (input.action === 'CREATE_PRIVATE') {
            invite = randomBytes(32).toString('hex');
            lobby = await tx.lobby.create({
              data: {
                id: randomUUID(),
                kind: 'PRIVATE',
                mode: input.mode ?? 'CLASSIC',
                rulesetVersion: pokerRulesVersions[input.mode ?? 'CLASSIC'],
                capacity: input.capacity,
                hostId: p.userId,
                inviteHash: inviteHash(invite),
              },
            });
          } else if (input.action === 'JOIN_PRIVATE') {
            lobby = await tx.lobby.findFirst({
              where: {
                inviteHash: inviteHash(input.invite),
                kind: 'PRIVATE',
                status: 'OPEN',
              },
            });
            if (!lobby) throw new ApiFailure('LOBBY_UNAVAILABLE', 404);
          } else {
            const mode = input.mode ?? 'CLASSIC';
            const rulesetVersion = pokerRulesVersions[mode];
            const free = await tx.$queryRaw<
              { id: string }[]
            >`SELECT l."id" FROM "Lobby" l WHERE l."kind"='PUBLIC' AND l."mode"=${mode} AND l."rulesetVersion"=${rulesetVersion} AND l."status"='OPEN' AND (SELECT count(*) FROM "LobbySeat" s WHERE s."lobbyId"=l."id") < l."capacity" ORDER BY l."createdAt",l."id" LIMIT 1`;
            lobby = free[0]
              ? await tx.lobby.findUniqueOrThrow({ where: { id: free[0].id } })
              : await tx.lobby.create({
                  data: {
                    id: randomUUID(),
                    kind: 'PUBLIC',
                    mode,
                    rulesetVersion,
                    capacity: 2,
                    hostId: p.userId,
                  },
                });
          }
          const seats = await tx.lobbySeat.findMany({
            where: { lobbyId: lobby.id },
          });
          const seat = Array.from({ length: lobby.capacity }, (_, i) => i).find(
            (i) => !seats.some((s) => s.seat === i),
          );
          if (seat === undefined) throw new ApiFailure('LOBBY_FULL', 409);
          await tx.lobbySeat.updateMany({
            where: { lobbyId: lobby.id },
            data: { ready: false },
          });
          await tx.lobbySeat.create({
            data: { userId: p.userId, lobbyId: lobby.id, seat },
          });
          await tx.lobby.update({
            where: { id: lobby.id },
            data: { version: { increment: 1 } },
          });
        }
        const value = { ...(await this.view(tx, p.userId)), invite };
        await tx.operationRecord.create({
          data: {
            userId: p.userId,
            operation: 'LOBBY',
            key: input.commandId,
            requestHash: hash(input),
            result: json(value),
          },
        });
        return value;
      },
      { timeout: 15000 },
    );
    console.info(JSON.stringify({ event: 'lobby.command', status: 'ok' }));
    return result;
  }
}
@Controller('v1/lobby')
export class LobbyController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
    @Inject('ADMISSION_POLICY')
    private readonly policy: ClassicAdmissionPolicy | null,
  ) {}
  @Get() async read(@Req() req: Request) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return new LobbyService(this.auth.database, this.policy).read(
      await this.auth.authenticate(req.headers.authorization),
    );
  }
  @Post('commands') @HttpCode(200) async command(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return new LobbyService(this.auth.database, this.policy).command(
      await this.auth.authenticate(req.headers.authorization),
      body,
    );
  }
}
