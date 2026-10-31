-- CreateTable
CREATE TABLE "PackStock" (
    "packId" UUID NOT NULL,
    "issued" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PackStock_pkey" PRIMARY KEY ("packId")
);

-- CreateTable
CREATE TABLE "PackOpening" (
    "id" UUID NOT NULL,
    "packId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "draws" JSONB NOT NULL,
    "rngBox" TEXT NOT NULL,
    "rngKeyVersion" TEXT NOT NULL,
    "transferId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyBalance" (
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupplyBalance_pkey" PRIMARY KEY ("userId","kind")
);

-- CreateTable
CREATE TABLE "SupplyEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackOpening_transferId_key" ON "PackOpening"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "PackOpening_userId_commandId_key" ON "PackOpening"("userId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyEvent_sourceKey_key" ON "SupplyEvent"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyEvent_userId_kind_version_key" ON "SupplyEvent"("userId", "kind", "version");

ALTER TABLE "PackStock" ADD FOREIGN KEY ("packId") REFERENCES "PackDefinition"("id") ON DELETE RESTRICT;
ALTER TABLE "PackOpening" ADD FOREIGN KEY ("packId") REFERENCES "PackDefinition"("id") ON DELETE RESTRICT;
ALTER TABLE "PackOpening" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PackOpening" ADD FOREIGN KEY ("transferId") REFERENCES "RestrictedTransfer"("id") ON DELETE RESTRICT;
ALTER TABLE "SupplyBalance" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "SupplyEvent" ADD FOREIGN KEY ("userId","kind") REFERENCES "SupplyBalance"("userId","kind") ON DELETE RESTRICT;
ALTER TABLE "PackStock" ADD CHECK (issued>=0 AND version>0);
ALTER TABLE "SupplyBalance" ADD CHECK (kind='TRAIL_INK' AND units>=0 AND version>=0);
ALTER TABLE "SupplyEvent" ADD CHECK (kind='TRAIL_INK' AND delta<>0 AND abs(delta)<=1000000 AND version>0 AND (reason='PRESS_CLAIM' AND delta<0 OR reason IN('PACK_OPEN','TRAIL_REWARD','ACCESSIBLE_QUEST') AND delta>0));
CREATE TRIGGER pack_opening_immutable BEFORE UPDATE OR DELETE ON "PackOpening" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER supply_event_immutable BEFORE UPDATE OR DELETE ON "SupplyEvent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION supply_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SUPPLY_HISTORY_RETAINED';END IF;
 IF TG_OP='INSERT' THEN IF NEW.units<>0 OR NEW.version<>0 THEN RAISE EXCEPTION 'SUPPLY_ZERO_ORIGIN';END IF;RETURN NEW;END IF;
 IF NEW."userId"<>OLD."userId" OR NEW.kind<>OLD.kind OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'SUPPLY_VERSION';END IF;RETURN NEW;
END $$;
CREATE TRIGGER supply_balance_guard BEFORE INSERT OR UPDATE OR DELETE ON "SupplyBalance" FOR EACH ROW EXECUTE FUNCTION supply_balance_guard();
CREATE FUNCTION supply_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE actual "SupplyBalance"; BEGIN
 SELECT * INTO STRICT actual FROM "SupplyBalance" WHERE "userId"=NEW."userId" AND kind=NEW.kind;
 IF actual.units IS DISTINCT FROM(SELECT COALESCE(sum(delta),0) FROM "SupplyEvent" WHERE "userId"=NEW."userId" AND kind=NEW.kind) OR actual.version IS DISTINCT FROM(SELECT COALESCE(max(version),0) FROM "SupplyEvent" WHERE "userId"=NEW."userId" AND kind=NEW.kind) THEN RAISE EXCEPTION 'SUPPLY_RECONCILIATION';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER supply_balance_reconcile AFTER INSERT OR UPDATE ON "SupplyBalance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION supply_reconcile();
CREATE CONSTRAINT TRIGGER supply_event_reconcile AFTER INSERT ON "SupplyEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION supply_reconcile();
CREATE FUNCTION pack_stock_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PACK_STOCK_RETAINED';END IF;
 IF TG_OP='INSERT' THEN IF NEW.issued<>0 OR NEW.version<>1 THEN RAISE EXCEPTION 'PACK_STOCK_ORIGIN';END IF;RETURN NEW;END IF;
 IF NEW."packId"<>OLD."packId" OR NEW.issued<>OLD.issued+1 OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'PACK_STOCK_VERSION';END IF;RETURN NEW;
END $$;
CREATE TRIGGER pack_stock_guard BEFORE INSERT OR UPDATE OR DELETE ON "PackStock" FOR EACH ROW EXECUTE FUNCTION pack_stock_guard();
CREATE FUNCTION pack_stock_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE issued_count integer; cap integer; BEGIN
 SELECT s.issued,(d.definition->>'stockLimit')::integer INTO issued_count,cap FROM "PackStock" s JOIN "PackDefinition" d ON d.id=s."packId" WHERE s."packId"=NEW."packId";
 IF issued_count IS NULL OR issued_count<>(SELECT count(*) FROM "PackOpening" WHERE "packId"=NEW."packId") OR cap IS NOT NULL AND issued_count>cap THEN RAISE EXCEPTION 'PACK_STOCK_RECONCILIATION';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pack_stock_reconcile AFTER INSERT OR UPDATE ON "PackStock" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pack_stock_reconcile();
CREATE CONSTRAINT TRIGGER pack_opening_stock_reconcile AFTER INSERT ON "PackOpening" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pack_stock_reconcile();
CREATE FUNCTION pack_opening_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE d "PackDefinition"; t "RestrictedTransfer"; actual jsonb; reward jsonb; roll integer; n integer; total integer; ink integer:=0; cards integer:=0; BEGIN
 SELECT * INTO STRICT d FROM "PackDefinition" WHERE id=NEW."packId";
 SELECT * INTO STRICT t FROM "RestrictedTransfer" WHERE id=NEW."transferId";
 IF d.status<>'PUBLISHED' OR NEW.snapshot<>d.definition OR NEW."definitionHash"<>d."definitionHash" OR NEW.snapshot->>'kind'<>'DISCOVERY' OR NEW."createdAt"<(NEW.snapshot->>'startsAt')::timestamptz OR NEW."createdAt">=(NEW.snapshot->>'endsAt')::timestamptz OR t.currency<>'TRAIL_CREDITS' OR t.purpose<>'BUY_EARNED_PACK' OR NOT EXISTS(SELECT 1 FROM "RestrictedEntry" e JOIN "RestrictedAccount" a ON a.id=e."accountId" WHERE e."transferId"=t.id AND a."userId"=NEW."userId" AND e.amount=-(NEW.snapshot->>'price')::int) OR NEW.result->>'openingId'<>NEW.id::text OR NEW.result->>'packId'<>NEW."packId"::text OR NEW.result->>'definitionHash'<>NEW."definitionHash" OR (NEW.result->>'charged')::int<>(NEW.snapshot->>'price')::int OR NEW.result->>'currency'<>'TRAIL_CREDITS' OR NEW.result->>'rngVersion'<>'HMAC_SHA256_V1' THEN RAISE EXCEPTION 'PACK_OPENING_RECEIPT';END IF;
 n:=(NEW.snapshot->>'drawCount')::int;IF jsonb_array_length(NEW.draws)<>n OR jsonb_array_length(NEW.result->'outcomes')<>n THEN RAISE EXCEPTION 'PACK_DRAW_COUNT';END IF;
 SELECT sum((p->>'weight')::int) INTO total FROM jsonb_array_elements(NEW.snapshot->'pool') p;
 FOR i IN 0..n-1 LOOP
  roll:=(NEW.draws->>i)::int;IF roll<0 OR roll>=total THEN RAISE EXCEPTION 'PACK_DRAW_RANGE';END IF;
  SELECT p->'reward' INTO reward FROM(SELECT value AS p,sum((value->>'weight')::int) OVER(ORDER BY ordinality) AS upper FROM jsonb_array_elements(NEW.snapshot->'pool') WITH ORDINALITY) pool WHERE roll<upper ORDER BY upper LIMIT 1;
  actual:=NEW.result->'outcomes'->i;
  IF reward->>'kind' IS DISTINCT FROM actual->>'kind' THEN RAISE EXCEPTION 'PACK_DRAW_KIND';END IF;
  IF reward->>'kind'='TRAIL_INK' THEN
   IF (reward->>'units')::int<>(actual->>'units')::int THEN RAISE EXCEPTION 'PACK_INK_UNITS';END IF;ink:=ink+(actual->>'units')::int;
  ELSE
   cards:=cards+1;
   IF reward->>'templateId'<>actual->>'templateId' OR reward->>'branch'<>actual->>'branch' OR NOT EXISTS(SELECT 1 FROM "CardInstance" c JOIN "OwnershipEvent" e ON e.id=c."originEventId" JOIN "CardTemplate" ct ON ct.id=c."templateId" WHERE c.id=(actual->>'instanceId')::uuid AND c."ownerId"=NEW."userId" AND c."templateId"=(reward->>'templateId')::uuid AND c.branch::text=reward->>'branch' AND c.level=CASE WHEN c.branch='BLUE' THEN 1 ELSE 2 END AND c.rarity=ct.rarity AND e."sourceKey"='pack:'||NEW.id||':card:'||i AND e.reason='EARNED_PACK' AND e.action='GRANT') THEN RAISE EXCEPTION 'PACK_CARD_ORIGIN';END IF;
  END IF;
 END LOOP;
 IF cards<>(SELECT count(*) FROM "OwnershipEvent" WHERE "sourceKey" LIKE 'pack:'||NEW.id||':card:%') THEN RAISE EXCEPTION 'PACK_CARD_COUNT';END IF;
 IF ink>0 AND NOT EXISTS(SELECT 1 FROM "SupplyEvent" WHERE "userId"=NEW."userId" AND "sourceKey"='pack:'||NEW.id||':ink' AND delta=ink AND reason='PACK_OPEN') OR ink=0 AND EXISTS(SELECT 1 FROM "SupplyEvent" WHERE "sourceKey"='pack:'||NEW.id||':ink') THEN RAISE EXCEPTION 'PACK_INK_PROVENANCE';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pack_opening_reconcile AFTER INSERT ON "PackOpening" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pack_opening_reconcile();
