import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currencyDirection } from '@deckforge/card-domain';
import type { Prisma } from '@deckforge/database';
import { walletViewSchema } from '@deckforge/contracts';
import type { AuthService } from './auth/service';
import { ApiFailure } from './auth/errors';
import { hash, lockPrincipal } from './rooms/shared';
const decisionSchema = z
  .object({
    userId: z.uuid(),
    currency: z.enum(['TRAIL_CREDITS', 'STORE_GEMS']),
    purpose: z.enum([
      'EARN_ACTIVITY',
      'EARN_ACCESSIBLE_QUEST',
      'BUY_SCREEN',
      'BUY_EARNED_PACK',
      'BUY_SUPPLY',
      'VERIFIED_PURCHASE',
      'BUY_COSMETIC',
      'PURCHASE_REFUND',
    ]),
    amount: z.bigint().min(1n).max(1000000000000n),
    sourceKey: z.string().min(1).max(200),
    operatorId: z.string().min(1).max(100),
    proofReference: z.string().min(1).max(200),
    policyVersion: z.string().min(1).max(100),
  })
  .strict();
const systemIds = {
  TRAIL_CREDITS: {
    ISSUANCE: '00000000-0000-4000-8000-000000000381',
    SINK: '00000000-0000-4000-8000-000000000382',
  },
  STORE_GEMS: {
    ISSUANCE: '00000000-0000-4000-8000-000000000383',
    SINK: '00000000-0000-4000-8000-000000000384',
  },
} as const;
/** Trusted transaction primitive, not proof verification or an API grant. The feature caller must
 * verify canonical activity, an approved accessible quest or platform billing BEFORE calling.
 * No runtime activity/billing adapter or public mutation is configured by B038. */
export async function moveRestrictedCurrency(
  tx: Prisma.TransactionClient,
  raw: z.infer<typeof decisionSchema>,
) {
  const input = decisionSchema.parse(raw);
  let direction;
  try {
    direction = currencyDirection(input.currency, input.purpose);
  } catch {
    throw new ApiFailure('FORBIDDEN_CURRENCY_USE', 422);
  }
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${input.userId}::uuid FOR UPDATE`;
  if (
    (await tx.user.findUniqueOrThrow({ where: { id: input.userId } }))
      .status !== 'ACTIVE'
  )
    throw new ApiFailure('USER_INACTIVE', 403);
  const digest = hash({ ...input, amount: input.amount.toString() });
  const prior = await tx.restrictedTransfer.findUnique({
    where: { sourceKey: input.sourceKey },
  });
  if (prior) {
    if (prior.requestHash !== digest)
      throw new ApiFailure('LEDGER_SOURCE_CONFLICT', 409);
    return { transferId: prior.id };
  }
  const player = await tx.restrictedAccount.upsert({
    where: {
      userId_currency: { userId: input.userId, currency: input.currency },
    },
    create: {
      id: randomUUID(),
      userId: input.userId,
      currency: input.currency,
      kind: 'PLAYER',
    },
    update: {},
  });
  const kind = direction === 'SPEND' ? 'SINK' : 'ISSUANCE',
    id = systemIds[input.currency][kind];
  const system = await tx.restrictedAccount.upsert({
    where: { id },
    create: { id, currency: input.currency, kind },
    update: {},
  });
  const accounts = [player.id, system.id].sort();
  await tx.$queryRaw`SELECT "id" FROM "RestrictedAccount" WHERE "id"=ANY(${accounts}::uuid[]) ORDER BY "id" FOR UPDATE`;
  const credit = direction === 'GRANT' ? input.amount : -input.amount;
  const current = await tx.restrictedAccount.findUniqueOrThrow({
    where: { id: player.id },
  });
  if (current.balance + credit < 0n)
    throw new ApiFailure('INSUFFICIENT_FUNDS', 422);
  const transfer = await tx.restrictedTransfer.create({
    data: {
      id: randomUUID(),
      sourceKey: input.sourceKey,
      requestHash: digest,
      currency: input.currency,
      purpose: input.purpose,
      operatorId: input.operatorId,
      proofReference: input.proofReference,
      policyVersion: input.policyVersion,
    },
  });
  await tx.restrictedEntry.createMany({
    data: [
      { transferId: transfer.id, accountId: player.id, amount: credit },
      { transferId: transfer.id, accountId: system.id, amount: -credit },
    ],
  });
  await tx.restrictedAccount.update({
    where: { id: player.id },
    data: { balance: { increment: credit } },
  });
  await tx.restrictedAccount.update({
    where: { id: system.id },
    data: { balance: { decrement: credit } },
  });
  return { transferId: transfer.id };
}
@Controller('v1/wallets')
export class WalletController {
  constructor(@Inject('AUTH_SERVICE') readonly auth: AuthService | null) {}
  @Get() async view(@Req() req: Request) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    const p = await this.auth.authenticate(req.headers.authorization);
    return this.auth.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const play = await tx.playChipAccount.findUnique({
          where: { userId: p.userId },
        }),
        accounts = await tx.restrictedAccount.findMany({
          where: { userId: p.userId },
        });
      return walletViewSchema.parse({
        playChips: (play?.balance ?? 0n).toString(),
        trailCredits: (
          accounts.find((a) => a.currency === 'TRAIL_CREDITS')?.balance ?? 0n
        ).toString(),
        storeGems: (
          accounts.find((a) => a.currency === 'STORE_GEMS')?.balance ?? 0n
        ).toString(),
        restrictions: {
          playChips: 'EARNED_PLAY_ONLY',
          trailCredits: 'VALIDATED_ACTIVITY_OR_ACCESSIBLE_QUEST_ONLY',
          storeGems: 'PAID_COSMETICS_ONLY',
          exchange: false,
          cashOut: false,
        },
      });
    });
  }
}
