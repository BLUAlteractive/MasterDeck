-- Legacy rows retain NULL deadlines: do not invent historical policy or rewrite events.
ALTER TABLE "GameRoom" ADD COLUMN "turnTimeoutMs" integer NOT NULL DEFAULT 30000 CHECK("turnTimeoutMs" BETWEEN 1000 AND 300000), ADD COLUMN "turnDeadline" timestamptz(3), ADD CHECK("status"<>'COMPLETE' OR "turnDeadline" IS NULL);
ALTER TABLE "GameEvent" ADD COLUMN "source" text NOT NULL DEFAULT 'PLAYER' CHECK("source" IN ('GENESIS','PLAYER','TIMEOUT')), ADD COLUMN "turnDeadline" timestamptz(3);
CREATE INDEX "GameRoom_turnDeadline_idx" ON "GameRoom"("turnDeadline") WHERE "status"='ACTIVE';
CREATE OR REPLACE FUNCTION game_room_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable game record'; END IF;
 IF NEW."id"<>OLD."id" OR NEW."rulesetVersion"<>OLD."rulesetVersion" OR NEW."initial"<>OLD."initial"
 OR NEW."commitment"<>OLD."commitment" OR NEW."createdAt"<>OLD."createdAt" OR OLD."status"='COMPLETE'
 OR NEW."turnTimeoutMs"<>OLD."turnTimeoutMs" OR NEW."stateVersion"<>OLD."stateVersion"+1 THEN RAISE EXCEPTION 'invalid game transition'; END IF;
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION game_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; r "GameRoom"; n integer; e jsonb; members integer; d timestamptz;
BEGIN
 IF TG_TABLE_NAME='GameRoom' THEN rid:=NEW."id"; ELSE rid:=NEW."roomId"; END IF;
 SELECT * INTO STRICT r FROM "GameRoom" WHERE "id"=rid;
 SELECT count(*) INTO n FROM "GameEvent" WHERE "roomId"=rid;
 SELECT "snapshot","turnDeadline" INTO e,d FROM "GameEvent" WHERE "roomId"=rid AND "stateVersion"=r."stateVersion";
 SELECT count(*) INTO members FROM "GameParticipant" WHERE "roomId"=rid;
 IF d IS DISTINCT FROM r."turnDeadline" OR n<>r."stateVersion"+1 OR e IS DISTINCT FROM r."snapshot" OR members NOT BETWEEN 2 AND 6 OR members IS DISTINCT FROM jsonb_array_length(r."snapshot"->'players')
 OR EXISTS(SELECT 1 FROM "GameParticipant" p WHERE p."roomId"=rid AND r."snapshot"->'players'->p."seat"->>'id' IS DISTINCT FROM p."userId"::text)
 THEN RAISE EXCEPTION 'inconsistent game aggregate'; END IF;
 RETURN NULL;
END $$;
