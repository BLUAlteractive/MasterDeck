CREATE TABLE "PressJob" (
 id UUID PRIMARY KEY,"userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,"cardId" UUID NOT NULL REFERENCES "CardInstance"(id) ON DELETE RESTRICT,"screenId" UUID NOT NULL REFERENCES "OwnedScreen"(id) ON DELETE RESTRICT,"definitionHash" TEXT NOT NULL,snapshot JSONB NOT NULL,"cardBefore" JSONB NOT NULL,policy JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',"stateVersion" INTEGER NOT NULL DEFAULT 1,"acceptedSteps" INTEGER NOT NULL DEFAULT 0,"accessibleUnits" INTEGER NOT NULL DEFAULT 0,"startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"activeSince" TIMESTAMPTZ(3),
 CONSTRAINT press_initial_progress CHECK("acceptedSteps"=0 AND "accessibleUnits"=0),CONSTRAINT press_initial_status CHECK(status IN('ACTIVE','PAUSED','CANCELLED','REVOKED')),CHECK("stateVersion">0 AND "definitionHash"~'^[a-f0-9]{64}$' AND (status='ACTIVE')=("activeSince" IS NOT NULL) AND ("activeSince" IS NULL OR "activeSince">="startedAt"))
);
CREATE UNIQUE INDEX press_one_owner ON "PressJob"("userId") WHERE status IN('ACTIVE','PAUSED','READY_TO_CLAIM');
CREATE UNIQUE INDEX press_one_card ON "PressJob"("cardId") WHERE status IN('ACTIVE','PAUSED','READY_TO_CLAIM');
CREATE UNIQUE INDEX press_one_screen ON "PressJob"("screenId") WHERE status IN('ACTIVE','PAUSED','READY_TO_CLAIM');
CREATE TABLE "PressJobEvent" (
 id UUID PRIMARY KEY,"jobId" UUID NOT NULL REFERENCES "PressJob"(id) ON DELETE RESTRICT,"userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,version INTEGER NOT NULL,action TEXT NOT NULL,"sourceKey" TEXT NOT NULL UNIQUE,"requestHash" TEXT NOT NULL,"before" JSONB,"after" JSONB NOT NULL,"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("jobId",version),CONSTRAINT press_initial_event CHECK(action IN('START','PAUSE','RESUME','CANCEL','REVOKE')),CHECK(version>0 AND "requestHash"~'^[a-f0-9]{64}$')
);
CREATE TRIGGER press_event_immutable BEFORE UPDATE OR DELETE ON "PressJobEvent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
ALTER TABLE "OwnedScreen" ADD COLUMN "jobId" UUID REFERENCES "PressJob"(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OwnedScreen" DROP CONSTRAINT screen_initial_state;
ALTER TABLE "OwnedScreen" ADD CONSTRAINT screen_reservation_state CHECK(status IN('AVAILABLE','ASSIGNED','REVOKED') AND "stateVersion">0 AND (status='AVAILABLE')=("jobId" IS NULL));
ALTER TABLE "ScreenEvent" DROP CONSTRAINT screen_initial_event;
ALTER TABLE "ScreenEvent" ADD CONSTRAINT screen_reservation_actions CHECK(action IN('PURCHASE','ASSIGN','RELEASE','REVOKE') AND version>0);
DROP TRIGGER owned_screen_immutable ON "OwnedScreen";
CREATE FUNCTION screen_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SCREEN_HISTORY_RETAINED';END IF;
 IF TG_OP='INSERT' THEN IF NEW.status<>'AVAILABLE' OR NEW."stateVersion"<>1 OR NEW."jobId" IS NOT NULL THEN RAISE EXCEPTION 'SCREEN_AVAILABLE_ORIGIN';END IF;RETURN NEW;END IF;
 IF (to_jsonb(NEW)-'status'-'stateVersion'-'jobId')<>(to_jsonb(OLD)-'status'-'stateVersion'-'jobId') OR NEW."stateVersion"<>OLD."stateVersion"+1 OR NOT(OLD.status='AVAILABLE' AND NEW.status='ASSIGNED' OR OLD.status='ASSIGNED' AND NEW.status IN('AVAILABLE','REVOKED')) OR OLD.status='ASSIGNED' AND NEW.status='REVOKED' AND NEW."jobId" IS DISTINCT FROM OLD."jobId" THEN RAISE EXCEPTION 'INVALID_SCREEN_RESERVATION';END IF;RETURN NEW;
END $$;
CREATE TRIGGER screen_reservation_guard BEFORE INSERT OR UPDATE OR DELETE ON "OwnedScreen" FOR EACH ROW EXECUTE FUNCTION screen_reservation_guard();
CREATE OR REPLACE FUNCTION screen_event_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE s "OwnedScreen";sid uuid;frame jsonb;BEGIN
 IF TG_TABLE_NAME='OwnedScreen' THEN sid:=NEW.id;ELSE sid:=NEW."screenId";END IF;
 SELECT * INTO STRICT s FROM "OwnedScreen" WHERE id=sid;
 frame:=jsonb_build_object('status',s.status,'stateVersion',s."stateVersion");IF s."jobId" IS NOT NULL THEN frame:=frame||jsonb_build_object('jobId',s."jobId");END IF;
 IF s."stateVersion"<>(SELECT count(*) FROM "ScreenEvent" WHERE "screenId"=sid) OR s."stateVersion"<>(SELECT COALESCE(max(version),0) FROM "ScreenEvent" WHERE "screenId"=sid) OR NOT EXISTS(SELECT 1 FROM "ScreenEvent" e WHERE e."screenId"=sid AND e.version=1 AND e.action='PURCHASE' AND e."userId"=s."userId" AND e."sourceKey"='screen:'||sid||':purchase' AND e."requestHash"=s."requestHash" AND e."before" IS NULL AND e."after"=jsonb_build_object('status','AVAILABLE','stateVersion',1)) OR EXISTS(SELECT 1 FROM "ScreenEvent" e WHERE e."screenId"=sid AND (e."userId"<>s."userId" OR e.version>1 AND e."before" IS DISTINCT FROM(SELECT p."after" FROM "ScreenEvent" p WHERE p."screenId"=sid AND p.version=e.version-1))) OR NOT EXISTS(SELECT 1 FROM "ScreenEvent" WHERE "screenId"=sid AND version=s."stateVersion" AND "after"=frame) THEN RAISE EXCEPTION 'SCREEN_EVENT_RECONCILIATION';END IF;
 IF s."jobId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PressJob" j WHERE j.id=s."jobId" AND j."screenId"=s.id AND j."userId"=s."userId" AND (s.status='ASSIGNED' AND j.status IN('ACTIVE','PAUSED','READY_TO_CLAIM') OR s.status='REVOKED' AND j.status IN('CANCELLED','REVOKED'))) THEN RAISE EXCEPTION 'SCREEN_JOB_LINK';END IF;RETURN NULL;
END $$;
CREATE FUNCTION press_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PRESS_HISTORY_RETAINED';END IF;
 IF TG_OP='INSERT' THEN IF NEW.status<>'ACTIVE' OR NEW."stateVersion"<>1 OR NEW."acceptedSteps"<>0 OR NEW."accessibleUnits"<>0 OR NEW."activeSince" IS DISTINCT FROM NEW."startedAt" THEN RAISE EXCEPTION 'PRESS_START_REQUIRED';END IF;RETURN NEW;END IF;
 IF (to_jsonb(NEW)-'status'-'stateVersion'-'activeSince')<>(to_jsonb(OLD)-'status'-'stateVersion'-'activeSince') OR NEW."stateVersion"<>OLD."stateVersion"+1 OR NOT(OLD.status='ACTIVE' AND NEW.status IN('PAUSED','CANCELLED','REVOKED') OR OLD.status='PAUSED' AND NEW.status IN('ACTIVE','CANCELLED','REVOKED')) THEN RAISE EXCEPTION 'INVALID_PRESS_TRANSITION';END IF;RETURN NEW;
END $$;
CREATE TRIGGER press_job_guard BEFORE INSERT OR UPDATE OR DELETE ON "PressJob" FOR EACH ROW EXECUTE FUNCTION press_job_guard();
CREATE FUNCTION press_start_origin() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE c "CardInstance";s "OwnedScreen"; BEGIN
 SELECT * INTO STRICT c FROM "CardInstance" WHERE id=NEW."cardId";SELECT * INTO STRICT s FROM "OwnedScreen" WHERE id=NEW."screenId";
 IF NOT COALESCE(c."ownerId"=NEW."userId" AND c.status='OWNED' AND c.level=(NEW.snapshot->>'sourceLevel')::int AND c.branch::text=NEW.snapshot->>'branch' AND NEW."cardBefore" @> jsonb_build_object('instanceId',c.id,'ownerId',c."ownerId",'status','OWNED','level',c.level,'branch',c.branch,'rarity',c.rarity,'stateVersion',c."stateVersion") AND s."userId"=NEW."userId" AND s.snapshot=NEW.snapshot AND s."definitionHash"=NEW."definitionHash" AND s.status='ASSIGNED' AND s."jobId"=NEW.id,false) THEN RAISE EXCEPTION 'PRESS_START_ORIGIN';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER press_start_origin AFTER INSERT ON "PressJob" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION press_start_origin();
CREATE FUNCTION press_job_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE j "PressJob";jid uuid;e "PressJobEvent";BEGIN
 IF TG_TABLE_NAME='PressJob' THEN jid:=NEW.id;ELSE jid:=NEW."jobId";END IF;
 SELECT * INTO STRICT j FROM "PressJob" WHERE id=jid;SELECT * INTO e FROM "PressJobEvent" WHERE "jobId"=jid AND version=j."stateVersion";
 IF j."stateVersion"<>(SELECT count(*) FROM "PressJobEvent" WHERE "jobId"=jid) OR j."stateVersion"<>(SELECT COALESCE(max(version),0) FROM "PressJobEvent" WHERE "jobId"=jid) OR e.id IS NULL OR NOT COALESCE(e."after"->>'status'=j.status AND (e."after"->>'stateVersion')::int=j."stateVersion" AND (e."after"->>'acceptedSteps')::int=j."acceptedSteps" AND (e."after"->>'accessibleUnits')::int=j."accessibleUnits",false) OR (e."after"->>'activeSince')::timestamptz IS DISTINCT FROM j."activeSince" OR NOT EXISTS(SELECT 1 FROM "PressJobEvent" WHERE "jobId"=jid AND version=1 AND action='START' AND "before" IS NULL) OR EXISTS(SELECT 1 FROM "PressJobEvent" x WHERE x."jobId"=jid AND (x."userId"<>j."userId" OR x.version>1 AND x."before" IS DISTINCT FROM(SELECT p."after" FROM "PressJobEvent" p WHERE p."jobId"=jid AND p.version=x.version-1))) THEN RAISE EXCEPTION 'PRESS_EVENT_RECONCILIATION';END IF;
 IF NOT EXISTS(SELECT 1 FROM "OwnedScreen" s WHERE s.id=j."screenId" AND s."userId"=j."userId" AND s.snapshot=j.snapshot AND s."definitionHash"=j."definitionHash" AND (j.status IN('ACTIVE','PAUSED','READY_TO_CLAIM') AND s.status='ASSIGNED' AND s."jobId"=j.id OR j.status='CANCELLED' AND j."acceptedSteps"+j."accessibleUnits"=0 AND s.status='AVAILABLE' AND s."jobId" IS NULL OR j.status='REVOKED' AND s.status='REVOKED' AND s."jobId"=j.id)) THEN RAISE EXCEPTION 'PRESS_SCREEN_RECONCILIATION';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER press_job_reconcile AFTER INSERT OR UPDATE ON "PressJob" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION press_job_reconcile();
CREATE CONSTRAINT TRIGGER press_event_reconcile AFTER INSERT ON "PressJobEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION press_job_reconcile();
CREATE FUNCTION press_card_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.level<>OLD.level OR NEW.status IN('CONSUMED','REVOKED')) AND EXISTS(SELECT 1 FROM "PressJob" WHERE "cardId"=OLD.id AND status IN('ACTIVE','PAUSED','READY_TO_CLAIM')) THEN RAISE EXCEPTION 'CARD_RESERVED_FOR_PRESS';END IF;RETURN NEW;
END $$;
CREATE TRIGGER press_card_reservation_guard BEFORE UPDATE ON "CardInstance" FOR EACH ROW EXECUTE FUNCTION press_card_reservation_guard();
ALTER TABLE "PressJobEvent" ADD CONSTRAINT press_event_transition CHECK(COALESCE(
 action='START' AND version=1 AND "before" IS NULL AND "after"->>'status'='ACTIVE' OR
 action='PAUSE' AND "before"->>'status'='ACTIVE' AND "after"->>'status'='PAUSED' OR
 action='RESUME' AND "before"->>'status'='PAUSED' AND "after"->>'status'='ACTIVE' OR
 action='CANCEL' AND "before"->>'status' IN('ACTIVE','PAUSED','READY_TO_CLAIM') AND "after"->>'status'='CANCELLED' OR
 action='REVOKE' AND "before"->>'status' IN('ACTIVE','PAUSED','READY_TO_CLAIM') AND "after"->>'status'='REVOKED',false));
ALTER TABLE "ScreenEvent" ADD CONSTRAINT screen_reservation_event_transition CHECK(COALESCE(
 action='PURCHASE' AND version=1 AND "before" IS NULL AND "after"->>'status'='AVAILABLE' OR
 action='ASSIGN' AND "before"->>'status'='AVAILABLE' AND "after"->>'status'='ASSIGNED' OR
 action='RELEASE' AND "before"->>'status'='ASSIGNED' AND "after"->>'status'='AVAILABLE' OR
 action='REVOKE' AND "before"->>'status'='ASSIGNED' AND "after"->>'status'='REVOKED',false));
