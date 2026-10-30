CREATE TABLE "SpadesRoom"("id" uuid PRIMARY KEY,"rulesetVersion" text NOT NULL,"stateVersion" integer NOT NULL DEFAULT 0 CHECK("stateVersion">=0),"phase" text NOT NULL CHECK("phase" IN ('BIDDING','PLAYING','ROUND_COMPLETE','MATCH_COMPLETE')),"initial" jsonb NOT NULL,"snapshot" jsonb NOT NULL,"createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "SpadesSeat"("roomId" uuid NOT NULL REFERENCES "SpadesRoom"("id") ON DELETE RESTRICT,"userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,"seat" integer NOT NULL CHECK("seat" BETWEEN 0 AND 3),PRIMARY KEY("roomId","userId"));
CREATE UNIQUE INDEX "SpadesSeat_roomId_seat_key" ON "SpadesSeat"("roomId","seat");
CREATE INDEX "SpadesSeat_userId_roomId_idx" ON "SpadesSeat"("userId","roomId");
CREATE TABLE "SpadesEvent"("id" uuid PRIMARY KEY,"roomId" uuid NOT NULL REFERENCES "SpadesRoom"("id") ON DELETE RESTRICT,"stateVersion" integer NOT NULL CHECK("stateVersion">=0),"actorUserId" uuid REFERENCES "User"("id") ON DELETE RESTRICT,"commandId" text,"requestHash" text,"command" jsonb NOT NULL,"snapshot" jsonb NOT NULL,"receipt" jsonb,"createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK(("stateVersion"=0 AND "actorUserId" IS NULL AND "commandId" IS NULL AND "receipt" IS NULL) OR ("stateVersion">0 AND "actorUserId" IS NOT NULL AND "commandId" IS NOT NULL AND "requestHash" IS NOT NULL AND "receipt" IS NOT NULL)));
CREATE UNIQUE INDEX "SpadesEvent_roomId_stateVersion_key" ON "SpadesEvent"("roomId","stateVersion");
CREATE UNIQUE INDEX "SpadesEvent_actorUserId_commandId_key" ON "SpadesEvent"("actorUserId","commandId");
CREATE TABLE "SpadesResult"("roomId" uuid PRIMARY KEY REFERENCES "SpadesRoom"("id") ON DELETE RESTRICT,"stateVersion" integer NOT NULL,"rulesetVersion" text NOT NULL,"winner" integer NOT NULL CHECK("winner" IN (0,1)),"teams" jsonb NOT NULL,"createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE FUNCTION spades_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable Spades evidence'; END $$;
CREATE TRIGGER spades_event_immutable BEFORE UPDATE OR DELETE ON "SpadesEvent" FOR EACH ROW EXECUTE FUNCTION spades_immutable();
CREATE TRIGGER spades_seat_immutable BEFORE UPDATE OR DELETE ON "SpadesSeat" FOR EACH ROW EXECUTE FUNCTION spades_immutable();
CREATE TRIGGER spades_result_immutable BEFORE UPDATE OR DELETE ON "SpadesResult" FOR EACH ROW EXECUTE FUNCTION spades_immutable();
CREATE FUNCTION spades_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable Spades room'; END IF;
 IF NEW."initial"<>OLD."initial" OR NEW."rulesetVersion"<>OLD."rulesetVersion" OR NEW."createdAt"<>OLD."createdAt" OR NEW."id"<>OLD."id" OR NEW."stateVersion"<>OLD."stateVersion"+1 OR OLD."phase"='MATCH_COMPLETE' THEN RAISE EXCEPTION 'invalid Spades transition'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER spades_transition BEFORE UPDATE OR DELETE ON "SpadesRoom" FOR EACH ROW EXECUTE FUNCTION spades_transition();
CREATE FUNCTION spades_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r "SpadesRoom"; room_id uuid; e "SpadesEvent"; BEGIN
 IF TG_TABLE_NAME='SpadesRoom' THEN room_id:=NEW."id"; ELSE room_id:=NEW."roomId"; END IF;
 SELECT * INTO r FROM "SpadesRoom" WHERE "id"=room_id;
 SELECT * INTO e FROM "SpadesEvent" WHERE "roomId"=room_id ORDER BY "stateVersion" DESC LIMIT 1;
 IF e."id" IS NULL OR e."stateVersion"<>r."stateVersion" OR e."snapshot"<>r."snapshot" OR (SELECT count(*) FROM "SpadesEvent" WHERE "roomId"=room_id)<>r."stateVersion"+1 OR (r."snapshot"->>'stateVersion')::integer IS DISTINCT FROM r."stateVersion" OR r."snapshot"->>'phase' IS DISTINCT FROM r."phase" OR r."snapshot"->'rules' IS DISTINCT FROM r."initial"->'rules' OR r."rulesetVersion" IS DISTINCT FROM r."initial"->'rules'->>'version' OR (SELECT count(*) FROM "SpadesSeat" WHERE "roomId"=room_id)<>4 THEN RAISE EXCEPTION 'inconsistent Spades aggregate'; END IF;
 IF EXISTS(SELECT 1 FROM "SpadesSeat" s WHERE s."roomId"=room_id AND r."snapshot"->'deal'->'players'->>s."seat" IS DISTINCT FROM s."userId"::text) OR EXISTS(SELECT 1 FROM "SpadesEvent" ev WHERE ev."roomId"=room_id AND ev."stateVersion">0 AND NOT EXISTS(SELECT 1 FROM "SpadesSeat" s WHERE s."roomId"=room_id AND s."userId"=ev."actorUserId")) THEN RAISE EXCEPTION 'invalid Spades membership'; END IF;
 IF (r."phase"='MATCH_COMPLETE')<>(EXISTS(SELECT 1 FROM "SpadesResult" WHERE "roomId"=room_id)) OR EXISTS(SELECT 1 FROM "SpadesResult" sr WHERE sr."roomId"=room_id AND (sr."stateVersion"<>r."stateVersion" OR sr."rulesetVersion"<>r."rulesetVersion" OR sr."winner"<>(r."snapshot"->>'winner')::integer OR sr."teams"<>r."snapshot"->'teams')) THEN RAISE EXCEPTION 'inconsistent Spades result'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER spades_room_consistent AFTER INSERT OR UPDATE ON "SpadesRoom" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION spades_consistent();
CREATE CONSTRAINT TRIGGER spades_event_consistent AFTER INSERT ON "SpadesEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION spades_consistent();
CREATE CONSTRAINT TRIGGER spades_seat_consistent AFTER INSERT ON "SpadesSeat" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION spades_consistent();
CREATE CONSTRAINT TRIGGER spades_result_consistent AFTER INSERT ON "SpadesResult" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION spades_consistent();
