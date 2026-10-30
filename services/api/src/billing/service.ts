import { randomUUID } from 'node:crypto';
import {
  billingProofSchema,
  billingContextSchema,
  billingReceiptSchema,
  cosmeticProductViewSchema,
  type BillingProof,
  type StorefrontPolicy,
} from '@deckforge/contracts';
import type { PrismaClient } from '@deckforge/database';
import type { Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, json, lockPrincipal } from '../rooms/shared';
import { approvedCosmeticProduct } from '../storefront';
import { openBilling, sealBilling } from './vault';
import { verifiedPurchaseSchema, type BillingConfig } from './providers';
export class BillingService {
  constructor(
    readonly db: PrismaClient,
    readonly config: BillingConfig,
    readonly catalog: StorefrontPolicy,
  ) {
    if (config.encryptionKey.length !== 32 || !config.approvalReference)
      throw new Error('BILLING_CONFIG_INVALID');
  }
  async context(p: Principal) {
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      if (
        (await tx.user.findUniqueOrThrow({ where: { id: p.userId } })).isGuest
      )
        throw new ApiFailure('PERMANENT_ACCOUNT_REQUIRED', 403);
      const id = randomUUID();
      await tx.billingBinding.createMany({
        data: [
          {
            id,
            userId: p.userId,
            googleHash: hash('deckforge.google.billing:' + id),
          },
        ],
        skipDuplicates: true,
      });
      const binding = await tx.billingBinding.findUniqueOrThrow({
        where: { userId: p.userId },
      });
      return billingContextSchema.parse({
        appleAppAccountToken: binding.id,
        googleObfuscatedAccountId: binding.googleHash,
        environment: this.config.environment,
      });
    });
  }
  private provider(platform: 'APPLE' | 'GOOGLE') {
    const p = this.config.providers[platform];
    if (!p) throw new ApiFailure('BILLING_NOT_CONFIGURED', 503);
    return p;
  }
  async verify(p: Principal, body: unknown) {
    const parsed = billingProofSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return this.record(parsed.data, p);
  }
  private async record(
    proof: BillingProof,
    p?: Principal,
    notificationKey?: string,
  ) {
    const verified = verifiedPurchaseSchema.parse(
      await this.provider(proof.platform).verify(proof),
    );
    if (
      verified.platform !== proof.platform ||
      verified.environment !== this.config.environment
    )
      throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
    const binding = await this.db.billingBinding.findFirst({
      where:
        proof.platform === 'APPLE'
          ? { id: verified.binding }
          : { googleHash: verified.binding },
    });
    if (!binding || (p && binding.userId !== p.userId))
      throw new ApiFailure('PURCHASE_ACCOUNT_MISMATCH', 403);
    const proofKey =
      this.config.environment +
      ':' +
      proof.platform +
      ':' +
      (proof.platform === 'GOOGLE'
        ? hash(proof.purchaseToken)
        : verified.transactionId);
    const observedHash = hash(verified),
      sourceKey = notificationKey
        ? notificationKey + ':' + observedHash
        : 'verified:' + hash({ proofKey, observedHash });
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${binding.userId}::uuid FOR UPDATE`;
        if (p) await lockPrincipal(tx, p);
        const user = await tx.user.findUniqueOrThrow({
          where: { id: binding.userId },
        });
        if (
          verified.state === 'ACTIVE' &&
          (user.status !== 'ACTIVE' || user.isGuest)
        )
          throw new ApiFailure('PERMANENT_ACCOUNT_REQUIRED', 403);
        let purchase = await tx.verifiedPurchase.findUnique({
          where: {
            platform_environment_transactionId: {
              environment: this.config.environment,
              platform: verified.platform,
              transactionId: verified.transactionId,
            },
          },
        });
        if (
          purchase &&
          (purchase.bindingId !== binding.id ||
            purchase.sku !== verified.sku ||
            purchase.proofKey !== proofKey)
        )
          throw new ApiFailure('PURCHASE_CONFLICT', 409);
        const status =
          purchase?.status === 'REVOKED' || verified.state === 'REVOKED'
            ? 'REVOKED'
            : 'ACTIVE';
        if (!purchase) {
          const product = await approvedCosmeticProduct(
              tx,
              this.catalog,
              verified.platform,
              verified.sku,
            ),
            id = randomUUID();
          purchase = await tx.verifiedPurchase.create({
            data: {
              id,
              userId: binding.userId,
              bindingId: binding.id,
              environment: this.config.environment,
              platform: verified.platform,
              transactionId: verified.transactionId,
              sku: verified.sku,
              productId: product.id,
              snapshot: json(product),
              proofKey,
              evidenceBox: sealBilling(
                proof,
                this.config.encryptionKey,
                'purchase:' + id,
              ),
              status,
            },
          });
          await tx.cosmeticGrant.createMany({
            data: product.contents.map((item) => ({
              id: randomUUID(),
              userId: binding.userId,
              itemId: item.id,
              purchaseId: id,
              sourceKey: 'billing:' + id + ':' + item.id,
              status,
            })),
          });
          if (verified.platform === 'GOOGLE')
            await tx.billingAcknowledgement.create({
              data: {
                purchaseId: id,
                status:
                  verified.acknowledged || status === 'REVOKED'
                    ? 'DONE'
                    : 'PENDING',
              },
            });
        } else if (purchase.status === 'ACTIVE' && status === 'REVOKED') {
          purchase = await tx.verifiedPurchase.update({
            where: { id: purchase.id },
            data: { status: 'REVOKED', version: { increment: 1 } },
          });
          await tx.cosmeticGrant.updateMany({
            where: { purchaseId: purchase.id, status: 'ACTIVE' },
            data: { status: 'REVOKED', version: { increment: 1 } },
          });
        }
        // Recorded is an acknowledgement, never a claim that an old purchase remains usable.
        await tx.purchaseEvent.createMany({
          data: [
            {
              id: randomUUID(),
              purchaseId: purchase.id,
              sourceKey,
              observedState: verified.state,
              effectiveState: status,
              stateVersion: purchase.version,
              proofHash: observedHash,
            },
          ],
          skipDuplicates: true,
        });
        return billingReceiptSchema.parse({
          purchaseId: purchase.id,
          recorded: true,
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }
  async notification(
    platform: 'APPLE' | 'GOOGLE',
    body: unknown,
    authorization?: string,
  ) {
    const normalized = await this.provider(platform).notification(
        body,
        authorization,
      ),
      sourceKey =
        this.config.environment + ':' + platform + ':' + normalized.id,
      proofHash = hash(normalized.proof);
    await this.db.billingInbox.createMany({
      data: [
        {
          id: randomUUID(),
          sourceKey,
          platform,
          environment: this.config.environment,
          proofHash,
          evidenceBox: sealBilling(
            normalized.proof,
            this.config.encryptionKey,
            'notification:' + sourceKey,
          ),
        },
      ],
      skipDuplicates: true,
    });
    const stored = await this.db.billingInbox.findUniqueOrThrow({
      where: { sourceKey },
    });
    if (stored.proofHash !== proofHash || stored.platform !== platform)
      throw new ApiFailure('NOTIFICATION_CONFLICT', 409);
    return { accepted: true as const };
  }
  async recover(stopping: () => boolean = () => false) {
    const rows = await this.db.billingInbox.findMany({
      where: {
        status: 'PENDING',
        environment: this.config.environment,
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
    });
    for (const row of rows) {
      if (stopping()) return;
      try {
        const raw = openBilling(
          row.evidenceBox,
          this.config.encryptionKey,
          'notification:' + row.sourceKey,
        );
        if (raw !== null) {
          const proof = billingProofSchema.parse(raw);
          if (proof.platform !== row.platform)
            throw new Error('INVALID_BILLING_EVIDENCE');
          await this.record(proof, undefined, 'notification:' + row.sourceKey);
        }
        await this.db.billingInbox.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: { status: 'PROCESSED' },
        });
      } catch {
        await this.db.billingInbox.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(
              Date.now() +
                Math.min(300000, 1000 * 2 ** Math.min(row.attempts, 8)),
            ),
          },
        });
        console.warn(
          JSON.stringify({ event: 'billing.notification', status: 'retry' }),
        );
      }
    }
    const acknowledgements = await this.db.billingAcknowledgement.findMany({
      where: {
        status: 'PENDING',
        purchase: { environment: this.config.environment },
        nextAttemptAt: { lte: new Date() },
      },
      include: { purchase: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
    });
    for (const row of acknowledgements) {
      if (stopping()) return;
      try {
        const proof = billingProofSchema.parse(
          openBilling(
            row.purchase.evidenceBox,
            this.config.encryptionKey,
            'purchase:' + row.purchaseId,
          ),
        );
        const provider = this.provider(proof.platform);
        if (!provider.acknowledge)
          throw new Error('ACKNOWLEDGEMENT_NOT_CONFIGURED');
        await provider.acknowledge(proof);
        await this.db.billingAcknowledgement.updateMany({
          where: { purchaseId: row.purchaseId, status: 'PENDING' },
          data: { status: 'DONE' },
        });
      } catch {
        await this.db.billingAcknowledgement.updateMany({
          where: { purchaseId: row.purchaseId, status: 'PENDING' },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(
              Date.now() +
                Math.min(300000, 1000 * 2 ** Math.min(row.attempts, 8)),
            ),
          },
        });
        console.warn(
          JSON.stringify({ event: 'billing.acknowledgement', status: 'retry' }),
        );
      }
    }
  }
  async currentPurchase(userId: string, id: string) {
    const purchase = await this.db.verifiedPurchase.findUnique({
      where: { id },
    });
    if (!purchase || purchase.userId !== userId)
      throw new ApiFailure('PURCHASE_NOT_FOUND', 404);
    return {
      id: purchase.id,
      status: purchase.status,
      product: cosmeticProductViewSchema.parse(purchase.snapshot),
    };
  }
}
export function startBillingWorker(service: BillingService) {
  let running: Promise<void> | null = null,
    closed = false;
  const tick = () => {
    if (closed || running) return;
    running = service
      .recover(() => closed)
      .catch(() => {
        console.warn(
          JSON.stringify({ event: 'billing.worker', status: 'retry' }),
        );
      })
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    closed = true;
    clearInterval(timer);
    await running;
  };
}
