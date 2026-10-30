-- CreateTable
CREATE TABLE "PurchaseReconciliation" (
    "purchaseId" UUID NOT NULL,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseReconciliation_pkey" PRIMARY KEY ("purchaseId")
);

-- CreateTable
CREATE TABLE "BillingRevocation" (
    "id" UUID NOT NULL,
    "proofKey" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingRevocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingVoidScan" (
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cursorBox" TEXT,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "windowEnd" TIMESTAMPTZ(3) NOT NULL,
    "lastCompletedAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coverageGap" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BillingVoidScan_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PurchaseReconciliation_nextAttemptAt_idx" ON "PurchaseReconciliation"("nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRevocation_proofKey_key" ON "BillingRevocation"("proofKey");

-- AddForeignKey
ALTER TABLE "PurchaseReconciliation" ADD CONSTRAINT "PurchaseReconciliation_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "VerifiedPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing rows already have B040 platform evidence; schedule verification, never synthesize it.
INSERT INTO "PurchaseReconciliation"("purchaseId") SELECT "id" FROM "VerifiedPurchase";
CREATE TRIGGER billing_revocation_immutable BEFORE UPDATE OR DELETE ON "BillingRevocation" FOR EACH ROW EXECUTE FUNCTION game_immutable();
ALTER TABLE "BillingRevocation" ADD CHECK ("platform"='GOOGLE' AND "environment" IN ('SANDBOX','PRODUCTION') AND "proofKey"~'^(SANDBOX|PRODUCTION):GOOGLE:[a-f0-9]{64}$');
CREATE FUNCTION billing_tombstone_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "BillingRevocation" r WHERE r."proofKey"=NEW."proofKey" AND (r."transactionId"<>NEW."transactionId" OR NEW."status"<>'REVOKED')) THEN RAISE EXCEPTION 'purchase revocation is permanent';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER billing_tombstone_consistent AFTER INSERT OR UPDATE ON "VerifiedPurchase" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_tombstone_consistent();
CREATE FUNCTION billing_reconciliation_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW."purchaseId"<>OLD."purchaseId" THEN RAISE EXCEPTION 'retain purchase recovery identity';END IF;RETURN NEW;
END $$;
CREATE TRIGGER billing_reconciliation_identity BEFORE UPDATE OR DELETE ON "PurchaseReconciliation" FOR EACH ROW EXECUTE FUNCTION billing_reconciliation_identity();
CREATE FUNCTION billing_scan_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'retain billing scan evidence';END IF;
 IF NEW."key"<>OLD."key" OR NEW."version"<>OLD."version"+1 OR (OLD."coverageGap" AND NOT NEW."coverageGap") THEN RAISE EXCEPTION 'invalid billing scan transition';END IF;RETURN NEW;
END $$;
CREATE TRIGGER billing_scan_transition BEFORE UPDATE OR DELETE ON "BillingVoidScan" FOR EACH ROW EXECUTE FUNCTION billing_scan_transition();
