-- CreateTable
CREATE TABLE "AdminCapability" (
    "userId" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminCapability_pkey" PRIMARY KEY ("userId","capability")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReview" (
    "seriesId" UUID NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "review" TEXT NOT NULL,
    "reviewerId" UUID NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReview_pkey" PRIMARY KEY ("seriesId","manifestHash","review")
);

-- CreateTable
CREATE TABLE "ProductAvailability" (
    "productId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductAvailability_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE INDEX "AdminAction_scope_createdAt_idx" ON "AdminAction"("scope", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminAction_actorId_commandId_key" ON "AdminAction"("actorId", "commandId");

ALTER TABLE "AdminCapability" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "AdminCapability" ADD CHECK ("capability" IN ('CONTENT_EDITOR','CONTENT_REVIEWER','CONTENT_PUBLISHER','PRODUCT_OPERATOR','SUPPORT','AUDITOR','PRIVACY_OPERATOR','RELEASE_OPERATOR') AND length("grantedBy")>=8);
ALTER TABLE "AdminAction" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "AdminAction" ADD CHECK (length("reason")>=8 AND "requestHash"~'^[a-f0-9]{64}$');
ALTER TABLE "ContentReview" ADD FOREIGN KEY ("seriesId") REFERENCES "CardSeries"("id") ON DELETE RESTRICT;
ALTER TABLE "ContentReview" ADD FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ContentReview" ADD CHECK ("review" IN ('DESIGN','PRODUCTION') AND "manifestHash"~'^[a-f0-9]{64}$' AND length("evidence")>=8);
ALTER TABLE "ProductAvailability" ADD FOREIGN KEY ("productId") REFERENCES "CosmeticProduct"("id") ON DELETE RESTRICT;
ALTER TABLE "ProductAvailability" ADD CHECK ("version">0);
CREATE TRIGGER admin_action_immutable BEFORE UPDATE OR DELETE ON "AdminAction" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER content_review_immutable BEFORE UPDATE OR DELETE ON "ContentReview" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION admin_capability_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'revokedAt') IS DISTINCT FROM (to_jsonb(OLD)-'revokedAt') OR OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL THEN RAISE EXCEPTION 'ADMIN_CAPABILITY_RETAINED'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER admin_capability_guard BEFORE UPDATE OR DELETE ON "AdminCapability" FOR EACH ROW EXECUTE FUNCTION admin_capability_guard();
CREATE FUNCTION product_availability_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PRODUCT_SWITCH_HISTORY';END IF;
 IF TG_OP='UPDATE' AND (NEW."productId"<>OLD."productId" OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'PRODUCT_SWITCH_VERSION';END IF;
 IF NOT EXISTS(SELECT 1 FROM "AdminAction" WHERE scope=NEW."productId"::text AND action='PRODUCT_SWITCH' AND (result->>'version')::int=(SELECT version FROM "ProductAvailability" WHERE "productId"=NEW."productId") AND (result->>'enabled')::boolean=(SELECT enabled FROM "ProductAvailability" WHERE "productId"=NEW."productId")) THEN RAISE EXCEPTION 'PRODUCT_SWITCH_AUDIT';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER product_availability_audit AFTER INSERT OR UPDATE ON "ProductAvailability" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION product_availability_guard();
