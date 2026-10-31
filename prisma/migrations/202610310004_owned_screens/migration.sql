CREATE TABLE "OwnedScreen" (
 "id" UUID PRIMARY KEY,"userId" UUID NOT NULL,"patternId" UUID NOT NULL,"definitionHash" TEXT NOT NULL,"snapshot" JSONB NOT NULL,"commandId" UUID NOT NULL,"requestHash" TEXT NOT NULL,"transferId" UUID NOT NULL UNIQUE,"result" JSONB NOT NULL,"status" TEXT NOT NULL DEFAULT 'AVAILABLE',"stateVersion" INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("userId","commandId"),FOREIGN KEY("userId") REFERENCES "User"(id) ON DELETE RESTRICT,FOREIGN KEY("patternId") REFERENCES "ScreenPattern"(id) ON DELETE RESTRICT,FOREIGN KEY("transferId") REFERENCES "RestrictedTransfer"(id) ON DELETE RESTRICT,
 CONSTRAINT screen_initial_state CHECK(status='AVAILABLE' AND "stateVersion"=1),CHECK("definitionHash"~'^[a-f0-9]{64}$' AND "requestHash"~'^[a-f0-9]{64}$')
);
CREATE TABLE "ScreenEvent" (
 "id" UUID PRIMARY KEY,"screenId" UUID NOT NULL,"userId" UUID NOT NULL,"version" INTEGER NOT NULL,"action" TEXT NOT NULL,"sourceKey" TEXT NOT NULL UNIQUE,"requestHash" TEXT NOT NULL,"before" JSONB,"after" JSONB NOT NULL,"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("screenId",version),FOREIGN KEY("screenId") REFERENCES "OwnedScreen"(id) ON DELETE RESTRICT,FOREIGN KEY("userId") REFERENCES "User"(id) ON DELETE RESTRICT,
 CONSTRAINT screen_initial_event CHECK(action='PURCHASE' AND version=1),CHECK("requestHash"~'^[a-f0-9]{64}$')
);
CREATE TRIGGER owned_screen_immutable BEFORE UPDATE OR DELETE ON "OwnedScreen" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER screen_event_immutable BEFORE UPDATE OR DELETE ON "ScreenEvent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION screen_purchase_origin() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE d "ScreenPattern";t "RestrictedTransfer"; r jsonb; BEGIN
 SELECT * INTO STRICT d FROM "ScreenPattern" WHERE id=NEW."patternId";
 SELECT * INTO STRICT t FROM "RestrictedTransfer" WHERE id=NEW."transferId";
 r:=NEW.result->'screen';
 IF NOT COALESCE(d.status='PUBLISHED' AND NEW.snapshot=d.definition AND NEW."definitionHash"=d."definitionHash" AND t.currency='TRAIL_CREDITS' AND t.purpose='BUY_SCREEN' AND EXISTS(SELECT 1 FROM "RestrictedEntry" e JOIN "RestrictedAccount" a ON a.id=e."accountId" WHERE e."transferId"=t.id AND a."userId"=NEW."userId" AND a.currency='TRAIL_CREDITS' AND e.amount=-(NEW.snapshot->>'creditPrice')::int) AND NEW.result->>'currency'='TRAIL_CREDITS' AND NEW.result->>'transferId'=t.id::text AND (NEW.result->>'charged')::int=(NEW.snapshot->>'creditPrice')::int AND r->>'screenId'=NEW.id::text AND r->>'patternId'=NEW."patternId"::text AND r->>'definitionHash'=NEW."definitionHash" AND r->'definition'=NEW.snapshot AND r->>'status'='AVAILABLE' AND (r->>'stateVersion')::int=1 AND (r->>'acquiredAt')::timestamptz=NEW."createdAt",false) THEN RAISE EXCEPTION 'SCREEN_PURCHASE_PROVENANCE';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER screen_purchase_origin AFTER INSERT ON "OwnedScreen" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION screen_purchase_origin();
CREATE FUNCTION screen_event_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE s "OwnedScreen";sid uuid; BEGIN
 IF TG_TABLE_NAME='OwnedScreen' THEN sid:=NEW.id;ELSE sid:=NEW."screenId";END IF;
 SELECT * INTO STRICT s FROM "OwnedScreen" WHERE id=sid;
 IF s."stateVersion"<>(SELECT count(*) FROM "ScreenEvent" WHERE "screenId"=sid) OR s."stateVersion"<>(SELECT COALESCE(max(version),0) FROM "ScreenEvent" WHERE "screenId"=sid) OR NOT EXISTS(SELECT 1 FROM "ScreenEvent" e WHERE e."screenId"=sid AND e.version=1 AND e.action='PURCHASE' AND e."userId"=s."userId" AND e."sourceKey"='screen:'||sid||':purchase' AND e."requestHash"=s."requestHash" AND e."before" IS NULL AND e."after"=jsonb_build_object('status','AVAILABLE','stateVersion',1)) OR EXISTS(SELECT 1 FROM "ScreenEvent" WHERE "screenId"=sid AND "userId"<>s."userId") THEN RAISE EXCEPTION 'SCREEN_EVENT_RECONCILIATION';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER owned_screen_event_reconcile AFTER INSERT OR UPDATE ON "OwnedScreen" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION screen_event_reconcile();
CREATE CONSTRAINT TRIGGER screen_event_reconcile AFTER INSERT ON "ScreenEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION screen_event_reconcile();
