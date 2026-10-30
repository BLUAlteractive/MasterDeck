CREATE TABLE "GameRoom" (
 "id" uuid PRIMARY KEY, "rulesetVersion" text NOT NULL CHECK ("rulesetVersion"='CLASSIC_NLHE_V1'),
 "stateVersion" integer NOT NULL DEFAULT 0 CHECK ("stateVersion" BETWEEN 0 AND 2147483647),
 "status" text NOT NULL CHECK ("status" IN ('ACTIVE','COMPLETE')),
 "initial" jsonb NOT NULL, "snapshot" jsonb NOT NULL,
 "commitment" text NOT NULL CHECK ("commitment" ~ '^[a-f0-9]{64}$'),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (jsonb_typeof("snapshot")='object' AND "snapshot" ?& ARRAY['stateVersion','rulesetVersion','street','players']),
 CHECK (("snapshot"->>'stateVersion')::integer="stateVersion"),
 CHECK ("snapshot"->>'rulesetVersion'="rulesetVersion"),
 CHECK (("status"='COMPLETE')=("snapshot"->>'street'='COMPLETE'))
);
CREATE TABLE "GameParticipant" (
 "roomId" uuid NOT NULL REFERENCES "GameRoom"("id") ON DELETE RESTRICT,
 "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "seat" integer NOT NULL CHECK ("seat" BETWEEN 0 AND 5),
 PRIMARY KEY("roomId","userId"), UNIQUE("roomId","seat")
);
CREATE INDEX "GameParticipant_userId_roomId_idx" ON "GameParticipant"("userId","roomId");
CREATE TABLE "GameEvent" (
 "id" uuid PRIMARY KEY,"roomId" uuid NOT NULL REFERENCES "GameRoom"("id") ON DELETE RESTRICT,
 "stateVersion" integer NOT NULL CHECK ("stateVersion" BETWEEN 0 AND 2147483647),
 "actorUserId" uuid REFERENCES "User"("id") ON DELETE RESTRICT,
 "commandId" text, "requestHash" text, "command" jsonb NOT NULL, "snapshot" jsonb NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GameEvent_roomId_stateVersion_key" UNIQUE("roomId","stateVersion"),
 CONSTRAINT "GameEvent_actorUserId_commandId_key" UNIQUE("actorUserId","commandId"),
 CHECK (("stateVersion"=0 AND "actorUserId" IS NULL AND "commandId" IS NULL AND "requestHash" IS NULL)
 OR ("stateVersion">0 AND "actorUserId" IS NOT NULL AND "commandId" IS NOT NULL AND "requestHash" IS NOT NULL AND "commandId" ~ '^[A-Za-z0-9_-]{10,128}$' AND "requestHash" ~ '^[a-f0-9]{64}$')),
 CHECK (("snapshot"->>'stateVersion')::integer="stateVersion")
);
CREATE FUNCTION game_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'immutable game record'; END $$;
CREATE TRIGGER game_event_immutable BEFORE UPDATE OR DELETE ON "GameEvent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER game_participant_immutable BEFORE UPDATE OR DELETE ON "GameParticipant" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION game_room_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable game record'; END IF;
 IF NEW."id"<>OLD."id" OR NEW."rulesetVersion"<>OLD."rulesetVersion" OR NEW."initial"<>OLD."initial"
 OR NEW."commitment"<>OLD."commitment" OR NEW."createdAt"<>OLD."createdAt" OR OLD."status"='COMPLETE'
 OR NEW."stateVersion"<>OLD."stateVersion"+1 THEN RAISE EXCEPTION 'invalid game transition'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER game_room_transition BEFORE UPDATE OR DELETE ON "GameRoom" FOR EACH ROW EXECUTE FUNCTION game_room_transition();
CREATE FUNCTION game_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; r "GameRoom"; n integer; e jsonb; members integer;
BEGIN
 IF TG_TABLE_NAME='GameRoom' THEN rid:=NEW."id"; ELSE rid:=NEW."roomId"; END IF;
 SELECT * INTO STRICT r FROM "GameRoom" WHERE "id"=rid;
 SELECT count(*) INTO n FROM "GameEvent" WHERE "roomId"=rid;
 SELECT "snapshot" INTO e FROM "GameEvent" WHERE "roomId"=rid AND "stateVersion"=r."stateVersion";
 SELECT count(*) INTO members FROM "GameParticipant" WHERE "roomId"=rid;
 IF n<>r."stateVersion"+1 OR e IS DISTINCT FROM r."snapshot" OR members NOT BETWEEN 2 AND 6 OR members IS DISTINCT FROM jsonb_array_length(r."snapshot"->'players')
 OR EXISTS(SELECT 1 FROM "GameParticipant" p WHERE p."roomId"=rid AND r."snapshot"->'players'->p."seat"->>'id' IS DISTINCT FROM p."userId"::text)
 THEN RAISE EXCEPTION 'inconsistent game aggregate'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER game_room_consistent AFTER INSERT OR UPDATE ON "GameRoom" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION game_consistent();
CREATE CONSTRAINT TRIGGER game_event_consistent AFTER INSERT ON "GameEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION game_consistent();
CREATE CONSTRAINT TRIGGER game_participant_consistent AFTER INSERT ON "GameParticipant" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION game_consistent();
