-- CreateTable
CREATE TABLE "CosmeticItem" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "presentation" JSONB NOT NULL,
    "rightsOwner" TEXT NOT NULL,
    "rightsBasis" TEXT NOT NULL,
    "approvalReference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosmeticProduct" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "appleProductId" TEXT NOT NULL,
    "googleProductId" TEXT NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "approvalReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceScale" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "CosmeticProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosmeticProductItem" (
    "productId" UUID NOT NULL,
    "itemId" UUID NOT NULL,

    CONSTRAINT "CosmeticProductItem_pkey" PRIMARY KEY ("productId","itemId")
);

-- CreateTable
CREATE TABLE "CosmeticGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticProduct_appleProductId_key" ON "CosmeticProduct"("appleProductId");

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticProduct_googleProductId_key" ON "CosmeticProduct"("googleProductId");

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticGrant_sourceKey_key" ON "CosmeticGrant"("sourceKey");

-- CreateIndex
CREATE INDEX "CosmeticGrant_userId_status_itemId_idx" ON "CosmeticGrant"("userId", "status", "itemId");

-- AddForeignKey
ALTER TABLE "CosmeticProductItem" ADD CONSTRAINT "CosmeticProductItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CosmeticProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticProductItem" ADD CONSTRAINT "CosmeticProductItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CosmeticItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticGrant" ADD CONSTRAINT "CosmeticGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticGrant" ADD CONSTRAINT "CosmeticGrant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CosmeticItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CosmeticItem" ADD CHECK ("rightsBasis"='ORIGINAL' AND length("rightsOwner")>0 AND jsonb_typeof("presentation")='object' AND "presentation"-ARRAY['kind','primaryColor','accentColor','motif']='{}'::jsonb AND COALESCE("presentation"->>'kind' IN ('TABLE_THEME','CARD_BACK','AVATAR') AND "presentation"->>'primaryColor'~'^#[0-9a-fA-F]{6}$' AND "presentation"->>'accentColor'~'^#[0-9a-fA-F]{6}$' AND "presentation"->>'motif' IN ('SOLID','STRIPES','DOTS'),false));
ALTER TABLE "CosmeticProduct" ADD CHECK ("version">0 AND "status" IN ('DRAFT','PUBLISHED','RETIRED') AND "priceMinor" BETWEEN 1 AND 1000000 AND "priceScale" BETWEEN 0 AND 3 AND "priceCurrency"~'^[A-Z]{3}$');
ALTER TABLE "CosmeticGrant" ADD CHECK ("status" IN ('ACTIVE','REVOKED') AND "version">0);
CREATE TRIGGER cosmetic_item_immutable BEFORE UPDATE OR DELETE ON "CosmeticItem" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER cosmetic_contents_immutable BEFORE UPDATE OR DELETE ON "CosmeticProductItem" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION cosmetic_product_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable product evidence';END IF;
 IF TG_OP='INSERT' THEN IF NEW."status"<>'DRAFT' THEN RAISE EXCEPTION 'product starts in draft';END IF;
 ELSE IF to_jsonb(NEW)-'status' IS DISTINCT FROM to_jsonb(OLD)-'status' OR NOT ((OLD."status"='DRAFT' AND NEW."status"='PUBLISHED') OR (OLD."status"='PUBLISHED' AND NEW."status"='RETIRED')) THEN RAISE EXCEPTION 'immutable product version';END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER cosmetic_product_guard BEFORE INSERT OR UPDATE OR DELETE ON "CosmeticProduct" FOR EACH ROW EXECUTE FUNCTION cosmetic_product_guard();
CREATE FUNCTION cosmetic_contents_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT "status" FROM "CosmeticProduct" WHERE "id"=NEW."productId")<>'DRAFT' THEN RAISE EXCEPTION 'published contents frozen';END IF;RETURN NEW;
END $$;
CREATE TRIGGER cosmetic_contents_guard BEFORE INSERT ON "CosmeticProductItem" FOR EACH ROW EXECUTE FUNCTION cosmetic_contents_guard();
CREATE FUNCTION cosmetic_catalog_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p "CosmeticProduct"; n integer; BEGIN
 SELECT * INTO p FROM "CosmeticProduct" WHERE "id"=NEW."id";
 IF p."status"='DRAFT' THEN RETURN NULL;END IF;
 SELECT count(*) INTO n FROM "CosmeticProductItem" WHERE "productId"=p."id";
 IF n NOT BETWEEN 1 AND 20 OR length(p."approvalReference")<1 OR EXISTS(SELECT 1 FROM "CosmeticProductItem" x JOIN "CosmeticItem" i ON i."id"=x."itemId" WHERE x."productId"=p."id" AND (i."approvalReference" IS NULL OR length(i."approvalReference")<1)) THEN RAISE EXCEPTION 'cosmetic approval or fixed contents missing';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cosmetic_catalog_consistent AFTER INSERT OR UPDATE ON "CosmeticProduct" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cosmetic_catalog_consistent();
CREATE FUNCTION cosmetic_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable cosmetic provenance';END IF;
 IF NEW."id"<>OLD."id" OR NEW."userId"<>OLD."userId" OR NEW."itemId"<>OLD."itemId" OR NEW."sourceKey"<>OLD."sourceKey" OR NEW."issuedAt"<>OLD."issuedAt" OR OLD."status"<>'ACTIVE' OR NEW."status"<>'REVOKED' OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'invalid cosmetic revocation';END IF;RETURN NEW;
END $$;
CREATE TRIGGER cosmetic_grant_guard BEFORE UPDATE OR DELETE ON "CosmeticGrant" FOR EACH ROW EXECUTE FUNCTION cosmetic_grant_guard();
