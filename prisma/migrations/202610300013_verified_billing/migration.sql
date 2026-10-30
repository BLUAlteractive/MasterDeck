-- AlterTable
ALTER TABLE "CosmeticGrant" ADD COLUMN     "purchaseId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "BillingBinding" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "googleHash" TEXT NOT NULL,

    CONSTRAINT "BillingBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifiedPurchase" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bindingId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "proofKey" TEXT NOT NULL,
    "evidenceBox" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "environment" TEXT NOT NULL,

    CONSTRAINT "VerifiedPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseEvent" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "observedState" TEXT NOT NULL,
    "effectiveState" TEXT NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "proofHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInbox" (
    "id" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "proofHash" TEXT NOT NULL,
    "evidenceBox" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "environment" TEXT NOT NULL,

    CONSTRAINT "BillingInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAcknowledgement" (
    "purchaseId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAcknowledgement_pkey" PRIMARY KEY ("purchaseId")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingBinding_userId_key" ON "BillingBinding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingBinding_googleHash_key" ON "BillingBinding"("googleHash");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedPurchase_proofKey_key" ON "VerifiedPurchase"("proofKey");

-- CreateIndex
CREATE INDEX "VerifiedPurchase_userId_createdAt_id_idx" ON "VerifiedPurchase"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedPurchase_platform_environment_transactionId_key" ON "VerifiedPurchase"("platform", "environment", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseEvent_sourceKey_key" ON "PurchaseEvent"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInbox_sourceKey_key" ON "BillingInbox"("sourceKey");

-- CreateIndex
CREATE INDEX "BillingInbox_status_nextAttemptAt_idx" ON "BillingInbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "BillingAcknowledgement_status_nextAttemptAt_idx" ON "BillingAcknowledgement"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "CosmeticGrant" ADD CONSTRAINT "CosmeticGrant_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "VerifiedPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingBinding" ADD CONSTRAINT "BillingBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedPurchase" ADD CONSTRAINT "VerifiedPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedPurchase" ADD CONSTRAINT "VerifiedPurchase_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "BillingBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedPurchase" ADD CONSTRAINT "VerifiedPurchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CosmeticProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEvent" ADD CONSTRAINT "PurchaseEvent_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "VerifiedPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAcknowledgement" ADD CONSTRAINT "BillingAcknowledgement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "VerifiedPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VerifiedPurchase" ADD CHECK ("platform" IN ('APPLE','GOOGLE') AND "environment" IN ('SANDBOX','PRODUCTION') AND "status" IN ('ACTIVE','REVOKED') AND "version" IN (1,2));
ALTER TABLE "BillingInbox" ADD CHECK ("platform" IN ('APPLE','GOOGLE') AND "environment" IN ('SANDBOX','PRODUCTION') AND "status" IN ('PENDING','PROCESSED') AND "attempts">=0);
ALTER TABLE "BillingAcknowledgement" ADD CHECK ("status" IN ('PENDING','DONE') AND "attempts">=0);
CREATE TRIGGER billing_binding_immutable BEFORE UPDATE OR DELETE ON "BillingBinding" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER purchase_event_immutable BEFORE UPDATE OR DELETE ON "PurchaseEvent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION purchase_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable purchase evidence';END IF;
 IF to_jsonb(NEW)-ARRAY['status','version'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','version'] OR OLD."status"<>'ACTIVE' OR NEW."status"<>'REVOKED' OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'invalid purchase transition';END IF;RETURN NEW;
END $$;
CREATE TRIGGER purchase_transition BEFORE UPDATE OR DELETE ON "VerifiedPurchase" FOR EACH ROW EXECUTE FUNCTION purchase_transition();
CREATE OR REPLACE FUNCTION cosmetic_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable cosmetic provenance';END IF;
 IF NEW."id"<>OLD."id" OR NEW."purchaseId"<>OLD."purchaseId" OR NEW."userId"<>OLD."userId" OR NEW."itemId"<>OLD."itemId" OR NEW."sourceKey"<>OLD."sourceKey" OR NEW."issuedAt"<>OLD."issuedAt" OR OLD."status"<>'ACTIVE' OR NEW."status"<>'REVOKED' OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'invalid cosmetic revocation';END IF;RETURN NEW;
END $$;
CREATE FUNCTION verified_purchase_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE pid uuid; p "VerifiedPurchase"; n integer; BEGIN
 IF TG_TABLE_NAME='VerifiedPurchase' THEN pid:=NEW."id";ELSE pid:=NEW."purchaseId";END IF;
 SELECT * INTO STRICT p FROM "VerifiedPurchase" WHERE "id"=pid;
 IF (SELECT "userId" FROM "BillingBinding" WHERE "id"=p."bindingId") IS DISTINCT FROM p."userId" OR COALESCE(p."snapshot"->>'id'<>p."productId"::text OR p."snapshot"->>'platformProductId'<>p."sku",true) THEN RAISE EXCEPTION 'invalid purchase binding';END IF;
 SELECT count(*) INTO n FROM "CosmeticGrant" WHERE "purchaseId"=pid;
 IF n IS DISTINCT FROM jsonb_array_length(p."snapshot"->'contents') OR n NOT BETWEEN 1 AND 20 OR EXISTS(SELECT 1 FROM "CosmeticGrant" g WHERE g."purchaseId"=pid AND (g."userId"<>p."userId" OR g."status"<>p."status" OR g."sourceKey"<>'billing:'||pid::text||':'||g."itemId"::text OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p."snapshot"->'contents') i WHERE i->>'id'=g."itemId"::text))) THEN RAISE EXCEPTION 'invalid purchase entitlements';END IF;
 IF NOT EXISTS(SELECT 1 FROM "PurchaseEvent" e WHERE e."purchaseId"=pid AND e."effectiveState"=p."status" AND e."stateVersion"=p."version") THEN RAISE EXCEPTION 'missing purchase event';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER verified_purchase_consistent AFTER INSERT OR UPDATE ON "VerifiedPurchase" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verified_purchase_consistent();
CREATE CONSTRAINT TRIGGER verified_grant_consistent AFTER INSERT OR UPDATE ON "CosmeticGrant" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verified_purchase_consistent();
CREATE CONSTRAINT TRIGGER verified_event_consistent AFTER INSERT ON "PurchaseEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verified_purchase_consistent();
CREATE FUNCTION billing_inbox_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable billing evidence';END IF;
 IF to_jsonb(NEW)-ARRAY['status','attempts','nextAttemptAt'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','attempts','nextAttemptAt'] OR OLD."status"='PROCESSED' THEN RAISE EXCEPTION 'immutable billing evidence';END IF;RETURN NEW;
END $$;
CREATE TRIGGER billing_inbox_identity BEFORE UPDATE OR DELETE ON "BillingInbox" FOR EACH ROW EXECUTE FUNCTION billing_inbox_identity();
CREATE FUNCTION billing_ack_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'retain billing acknowledgement';END IF;
 IF NEW."purchaseId"<>OLD."purchaseId" OR OLD."status"='DONE' THEN RAISE EXCEPTION 'immutable acknowledgement';END IF;RETURN NEW;
END $$;
CREATE TRIGGER billing_ack_identity BEFORE UPDATE OR DELETE ON "BillingAcknowledgement" FOR EACH ROW EXECUTE FUNCTION billing_ack_identity();
