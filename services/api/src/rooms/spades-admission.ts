import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomInt } from 'node:crypto';
import { shuffleFaces } from '@deckforge/game-core';
import { validateLoadout } from '@deckforge/card-domain';
import { writeCardTransition, type PrismaClient } from '@deckforge/database';
import {
  spadesPolicySchema,
  spadesPolicyResponseSchema,
  spadesStartSchema,
  gameStartResponseSchema,
  type SpadesPolicy,
} from '@deckforge/contracts';
import { initializeSpadesRoomTx } from './spades';
import { hash, json, lockPrincipal } from './shared';
import { ApiFailure } from '../auth/errors';
import type { AuthService, Principal } from '../auth/service';
export class SpadesAdmissionService {
  constructor(
    readonly database: PrismaClient,
    readonly policy: SpadesPolicy | null = null,
  ) {}
  async start(p: Principal, body: unknown) {
    const parsed = spadesStartSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    if (!this.policy) throw new ApiFailure('SPADES_POLICY_NOT_CONFIGURED', 503);
    const input = parsed.data,
      policy = spadesPolicySchema.parse(this.policy);
    const before = await this.database.lobbySeat.findMany({
      where: { lobbyId: input.lobbyId },
      orderBy: { seat: 'asc' },
    });
    const ids = [
      ...new Set([...before.map((seat) => seat.userId), p.userId]),
    ].sort();
    return this.database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=ANY(${ids}::uuid[]) ORDER BY "id" FOR UPDATE`;
        await lockPrincipal(tx, p);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(42819)::text`;
        const prior = await tx.operationRecord.findUnique({
          where: {
            userId_operation_key: {
              userId: p.userId,
              operation: 'SPADES_START',
              key: input.commandId,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== hash(input))
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return gameStartResponseSchema.parse(prior.result);
        }
        const lobby = await tx.lobby.findUnique({
          where: { id: input.lobbyId },
          include: { seats: { orderBy: { seat: 'asc' } } },
        });
        if (!lobby || lobby.hostId !== p.userId || lobby.mode !== 'SPADES')
          throw new ApiFailure('LOBBY_UNAVAILABLE', 404);
        if (
          lobby.rulesetVersion !== policy.rules.version ||
          hash(lobby.rulesConfig) !== hash(policy)
        )
          throw new ApiFailure('SPADES_POLICY_CHANGED', 409);
        const latest = await tx.spadesAdmission.findFirst({
          where: { lobbyId: lobby.id },
          orderBy: { sequence: 'desc' },
          include: { room: true },
        });
        let roomId: string;
        if (
          latest &&
          latest.room.phase !== 'MATCH_COMPLETE' &&
          latest.previousRoomId === (input.rematchOf ?? null)
        )
          roomId = latest.roomId;
        else {
          if (
            lobby.status !== 'OPEN' ||
            lobby.seats.length !== 4 ||
            !lobby.seats.every((seat) => seat.ready) ||
            lobby.seats.some(
              (seat) =>
                !before.some(
                  (old) => old.userId === seat.userId && old.seat === seat.seat,
                ),
            )
          )
            throw new ApiFailure('LOBBY_NOT_READY', 409);
          if (latest) {
            const oldSeats = await tx.spadesSeat.findMany({
              where: { roomId: latest.roomId },
              orderBy: { seat: 'asc' },
            });
            if (
              input.rematchOf !== latest.roomId ||
              latest.room.phase !== 'MATCH_COMPLETE' ||
              oldSeats.some(
                (seat, index) => seat.userId !== lobby.seats[index]!.userId,
              )
            )
              throw new ApiFailure('REMATCH_UNAVAILABLE', 409);
          } else if (input.rematchOf)
            throw new ApiFailure('REMATCH_UNAVAILABLE', 409);
          const loadouts = [];
          for (const seat of lobby.seats) {
            const loadout = await tx.loadout.findUnique({
              where: { userId: seat.userId },
              include: { cards: true },
            });
            if (!loadout) throw new ApiFailure('INVALID_LOADOUT', 422);
            loadouts.push({ seat, loadout });
          }
          const cardIds = loadouts
            .flatMap(({ loadout }) =>
              loadout.cards.map((card) => card.instanceId),
            )
            .sort();
          await tx.$queryRaw`SELECT "id" FROM "CardInstance" WHERE "id"=ANY(${cardIds}::uuid[]) ORDER BY "id" FOR UPDATE`;
          const cards = await tx.cardInstance.findMany({
            where: { id: { in: cardIds } },
          });
          for (const { seat, loadout } of loadouts)
            if (
              !validateLoadout(
                seat.userId,
                Object.fromEntries(
                  loadout.cards.map((card) => [card.faceId, card.instanceId]),
                ),
                cards.filter((card) => card.ownerId === seat.userId),
              ).valid
            )
              throw new ApiFailure('INVALID_LOADOUT', 422);
          roomId = await initializeSpadesRoomTx(tx, {
            players: lobby.seats.map((seat) => seat.userId),
            dealer: latest ? latest.sequence % 4 : 0,
            deck: [...shuffleFaces(randomInt)],
            rules: policy.rules,
          });
          await tx.spadesAdmission.create({
            data: {
              roomId,
              lobbyId: lobby.id,
              sequence: (latest?.sequence ?? 0) + 1,
              previousRoomId: latest?.roomId ?? null,
              policySnapshot: json(policy),
            },
          });
          const locked = new Map<
            string,
            { instanceId: string; stateVersion: number }[]
          >();
          for (const card of cards.sort((a, b) => a.id.localeCompare(b.id))) {
            const result = await writeCardTransition(tx, {
              instanceId: card.id,
              ownerId: card.ownerId,
              expectedVersion: card.stateVersion,
              command: {
                action: 'LOCK',
                lockToken: roomId,
                lockReason: 'SPADES_MATCH',
              },
              operatorId: 'spades.admission',
              sourceKey: `spades:${roomId}:lock:${card.id}`,
              reason: 'SPADES_MATCH',
            });
            const selected = locked.get(card.ownerId) ?? [];
            selected.push({
              instanceId: card.id,
              stateVersion: result.card.stateVersion,
            });
            locked.set(card.ownerId, selected);
          }
          for (const seat of lobby.seats)
            await tx.spadesReservation.create({
              data: {
                roomId,
                userId: seat.userId,
                items: json(locked.get(seat.userId)),
              },
            });
          await tx.lobby.update({
            where: { id: lobby.id },
            data: { status: 'STARTED', version: { increment: 1 } },
          });
        }
        const result = { gameId: roomId };
        await tx.operationRecord.create({
          data: {
            userId: p.userId,
            operation: 'SPADES_START',
            key: input.commandId,
            requestHash: hash(input),
            result,
          },
        });
        return result;
      },
      { timeout: 30000 },
    );
  }
}
@Controller('v1/spades')
export class SpadesAdmissionController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
    @Inject('SPADES_POLICY') private readonly policy: SpadesPolicy | null,
  ) {}
  @Get('policy') async rules(@Req() req: Request) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    await this.auth.authenticate(req.headers.authorization);
    return spadesPolicyResponseSchema.parse({
      available: !!this.policy,
      policy: this.policy,
    });
  }
  @Post('start') @HttpCode(200) async start(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return new SpadesAdmissionService(this.auth.database, this.policy).start(
      await this.auth.authenticate(req.headers.authorization),
      body,
    );
  }
}
