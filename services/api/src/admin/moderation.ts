import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '@deckforge/database';
import {
  safetyCommandSchema,
  safetyContextSchema,
  safetyViewSchema,
  moderationCommandSchema,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, json, lockPrincipal } from '../rooms/shared';
import { PokerRoomService } from '../rooms/service';
import { SpadesRoomService } from '../rooms/spades';
import { adminAccess, adminPrior, adminRecord } from './access';
export class ModerationService {
  constructor(readonly auth: AuthService) {}
  async participants(
    tx: Prisma.TransactionClient,
    p: Principal,
    game: string,
    gameId: string,
  ) {
    const members =
      game === 'POKER'
        ? await tx.gameParticipant.findMany({
            where: { roomId: gameId },
            orderBy: { seat: 'asc' },
          })
        : await tx.spadesSeat.findMany({
            where: { roomId: gameId },
            orderBy: { seat: 'asc' },
          });
    if (!members.some((m) => m.userId === p.userId))
      throw new ApiFailure('ROOM_UNAVAILABLE', 404);
    return members;
  }
  async context(p: Principal, game: string, gameId: string) {
    if (!safetyContextSchema.safeParse({ game, gameId }).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    return this.auth.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const members = await this.participants(tx, p, game, gameId),
        blocks = await tx.userBlock.findMany({
          where: { userId: p.userId, active: true },
        }),
        reports = await tx.gameReport.findMany({
          where: { userId: p.userId, game, gameId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
      return safetyViewSchema.parse({
        gameId,
        participants: members
          .filter((m) => m.userId !== p.userId)
          .map((m) => ({
            userId: m.userId,
            seat: m.seat,
            blocked: blocks.some((b) => b.targetUserId === m.userId),
          })),
        reports: reports.map((r) => ({
          id: r.id,
          code: r.code,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    });
  }
  async command(p: Principal, body: unknown) {
    const parsed = safetyCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    return this.auth.database.$transaction(async (tx) => {
      const users = [
        p.userId,
        ...(input.action === 'SET_BLOCK' ? [input.targetUserId] : []),
      ];
      for (const id of [...new Set(users)].sort())
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id}::uuid FOR UPDATE`;
      await lockPrincipal(tx, p);
      const prior = await tx.operationRecord.findUnique({
        where: {
          userId_operation_key: {
            userId: p.userId,
            operation: 'SAFETY',
            key: input.commandId,
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== hash(input))
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return prior.result;
      }
      const members = await this.participants(tx, p, input.game, input.gameId);
      let reference: string;
      if (input.action === 'SET_BLOCK') {
        if (
          input.targetUserId === p.userId ||
          !members.some((m) => m.userId === input.targetUserId)
        )
          throw new ApiFailure('PARTICIPANT_UNAVAILABLE', 404);
        await tx.userBlock.createMany({
          data: [{ userId: p.userId, targetUserId: input.targetUserId }],
          skipDuplicates: true,
        });
        let block = await tx.userBlock.findUniqueOrThrow({
          where: {
            userId_targetUserId: {
              userId: p.userId,
              targetUserId: input.targetUserId,
            },
          },
        });
        reference = randomUUID();
        if (block.version === 0 || block.active !== input.blocked) {
          block = await tx.userBlock.update({
            where: {
              userId_targetUserId: {
                userId: p.userId,
                targetUserId: input.targetUserId,
              },
            },
            data: { active: input.blocked, version: { increment: 1 } },
          });
          await tx.userBlockEvent.create({
            data: {
              id: reference,
              userId: p.userId,
              targetUserId: input.targetUserId,
              active: block.active,
              version: block.version,
              commandId: input.commandId,
            },
          });
        } else
          reference = (
            await tx.userBlockEvent.findUniqueOrThrow({
              where: {
                userId_targetUserId_version: {
                  userId: p.userId,
                  targetUserId: input.targetUserId,
                  version: block.version,
                },
              },
            })
          ).id;
      } else {
        const room =
          input.game === 'POKER'
            ? await tx.gameRoom.findUniqueOrThrow({
                where: { id: input.gameId },
              })
            : await tx.spadesRoom.findUniqueOrThrow({
                where: { id: input.gameId },
              });
        reference = randomUUID();
        await tx.gameReport.create({
          data: {
            id: reference,
            userId: p.userId,
            game: input.game,
            gameId: input.gameId,
            code: input.code,
            stateVersion: room.stateVersion,
            evidenceHash: hash(room.snapshot),
          },
        });
      }
      const result = { recorded: true, reference };
      await tx.operationRecord.create({
        data: {
          userId: p.userId,
          operation: 'SAFETY',
          key: input.commandId,
          requestHash: hash(input),
          result,
        },
      });
      return result;
    });
  }
  async admin(p: Principal, body: unknown) {
    const parsed = moderationCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    return this.auth.database.$transaction(
      async (tx) => {
        for (const id of [
          ...new Set([
            p.userId,
            ...('targetUserId' in input ? [input.targetUserId] : []),
          ]),
        ].sort())
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id}::uuid FOR UPDATE`;
        await adminAccess(tx, p, 'SUPPORT');
        const prior = await adminPrior(tx, p, input, input.commandId);
        if (prior) return prior.result;
        let scope: string, result: unknown;
        if ('targetUserId' in input) {
          scope = input.targetUserId;
          if (scope === p.userId)
            throw new ApiFailure('SELF_MODERATION_FORBIDDEN', 403);
          const user = await tx.user.findUnique({ where: { id: scope } });
          if (!user) throw new ApiFailure('USER_UNAVAILABLE', 404);
          if (
            input.action === 'REINSTATE' &&
            ((await tx.deletionRequest.findUnique({
              where: { userId: scope },
            })) ||
              !(await tx.adminAction.findFirst({
                where: { scope, action: 'SUSPEND' },
              })))
          )
            throw new ApiFailure('REINSTATEMENT_REVIEW_REQUIRED', 409);
          await tx.user.update({
            where: { id: scope },
            data: {
              status: input.action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE',
            },
          });
          await tx.authSession.updateMany({
            where: { identity: { userId: scope }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          if (input.action === 'SUSPEND') {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(42819)::text`;
            const seat = await tx.lobbySeat.findUnique({
              where: { userId: scope },
              include: { lobby: true },
            });
            if (
              seat?.lobby.status === 'OPEN' &&
              !(await tx.tournamentBinding.findUnique({
                where: { lobbyId: seat.lobbyId },
              }))
            ) {
              if (seat.lobby.hostId === scope) {
                await tx.lobbySeat.deleteMany({
                  where: { lobbyId: seat.lobbyId },
                });
                await tx.lobby.update({
                  where: { id: seat.lobbyId },
                  data: { status: 'CLOSED', version: { increment: 1 } },
                });
              } else {
                await tx.lobbySeat.delete({ where: { userId: scope } });
                await tx.lobbySeat.updateMany({
                  where: { lobbyId: seat.lobbyId },
                  data: { ready: false },
                });
                await tx.lobby.update({
                  where: { id: seat.lobbyId },
                  data: { version: { increment: 1 } },
                });
              }
            }
          }
          result = {
            userId: scope,
            status: input.action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE',
            sessionsRevoked: true,
          };
        } else if (input.action === 'REVIEW_REPORT') {
          const report = await tx.gameReport.findUnique({
            where: { id: input.reportId },
          });
          if (!report) throw new ApiFailure('REPORT_UNAVAILABLE', 404);
          scope = 'report:' + report.id;
          result = { reportId: report.id, decision: input.decision };
        } else {
          scope = input.gameId;
          const state =
            input.game === 'POKER'
              ? await new PokerRoomService(this.auth.database).trustedState(
                  tx,
                  input.gameId,
                )
              : await new SpadesRoomService(this.auth.database).trustedState(
                  tx,
                  input.gameId,
                );
          const events =
            input.game === 'POKER'
              ? await tx.gameEvent.findMany({
                  where: { roomId: input.gameId },
                  orderBy: { stateVersion: 'asc' },
                  select: { stateVersion: true, snapshot: true, command: true },
                })
              : await tx.spadesEvent.findMany({
                  where: { roomId: input.gameId },
                  orderBy: { stateVersion: 'asc' },
                  select: { stateVersion: true, snapshot: true, command: true },
                });
          // Staff receive reconstruction hashes; hidden hands, deck order and raw snapshots stay server-private.
          result = {
            gameId: input.gameId,
            game: input.game,
            consistent: true,
            stateVersion: state.stateVersion,
            stateHash: hash(state),
            eventCount: events.length,
            historyHash: hash(
              events.map((e) => ({
                stateVersion: e.stateVersion,
                stateHash: hash(e.snapshot),
                commandHash: hash(e.command),
              })),
            ),
            events: events.slice(-100).map((e) => ({
              stateVersion: e.stateVersion,
              stateHash: hash(e.snapshot),
              commandHash: hash(e.command),
            })),
            reportCount: await tx.gameReport.count({
              where: { game: input.game, gameId: input.gameId },
            }),
          };
        }
        await adminRecord(tx, p, input, 'SUPPORT', scope, input, result);
        return json(result);
      },
      { timeout: 30000 },
    );
  }
}
@Controller('v1/safety')
export class SafetyController {
  constructor(@Inject('AUTH_SERVICE') readonly auth: AuthService | null) {}
  private service() {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return new ModerationService(this.auth);
  }
  @Get('rooms/:game/:id') async context(
    @Req() r: Request,
    @Param('game') game: string,
    @Param('id') id: string,
  ) {
    const s = this.service();
    return s.context(
      await s.auth.authenticate(r.headers.authorization),
      game,
      id,
    );
  }
  @Post('commands') @HttpCode(200) async command(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const s = this.service();
    return s.command(await s.auth.authenticate(r.headers.authorization), b);
  }
  @Post('admin') @HttpCode(200) async admin(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const s = this.service();
    return s.admin(await s.auth.authenticate(r.headers.authorization), b);
  }
}
