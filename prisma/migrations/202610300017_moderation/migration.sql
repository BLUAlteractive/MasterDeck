-- CreateTable
CREATE TABLE "UserBlock" (
    "userId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("userId","targetUserId")
);

-- CreateTable
CREATE TABLE "UserBlockEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "commandId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameReport" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "game" TEXT NOT NULL,
    "gameId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBlockEvent_userId_targetUserId_version_key" ON "UserBlockEvent"("userId", "targetUserId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlockEvent_userId_commandId_key" ON "UserBlockEvent"("userId", "commandId");

-- CreateIndex
CREATE INDEX "GameReport_game_gameId_createdAt_idx" ON "GameReport"("game", "gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GameReport_userId_createdAt_idx" ON "GameReport"("userId", "createdAt");

ALTER TABLE "UserBlock" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "UserBlock" ADD FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "UserBlock" ADD CHECK ("userId"<>"targetUserId" AND version>=0);
ALTER TABLE "UserBlockEvent" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "UserBlockEvent" ADD FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "UserBlockEvent" ADD CHECK ("userId"<>"targetUserId" AND version>0);
ALTER TABLE "GameReport" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "GameReport" ADD CHECK (game IN ('POKER','SPADES') AND code IN ('RESULT_INCONSISTENT','CONNECTION_FAILURE','HARASSMENT','COLLUSION') AND "stateVersion">=0 AND "evidenceHash"~'^[a-f0-9]{64}$');
CREATE TRIGGER block_event_immutable BEFORE UPDATE OR DELETE ON "UserBlockEvent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER game_report_immutable BEFORE UPDATE OR DELETE ON "GameReport" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION block_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (NEW."userId",NEW."targetUserId") IS DISTINCT FROM (OLD."userId",OLD."targetUserId") OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'BLOCK_TRANSITION';END IF;RETURN NEW;
END $$;
CREATE TRIGGER block_guard BEFORE UPDATE OR DELETE ON "UserBlock" FOR EACH ROW EXECUTE FUNCTION block_guard();
CREATE FUNCTION block_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE b "UserBlock"; BEGIN
 SELECT * INTO b FROM "UserBlock" WHERE "userId"=NEW."userId" AND "targetUserId"=NEW."targetUserId";
 IF b.version<1 OR NOT EXISTS(SELECT 1 FROM "UserBlockEvent" WHERE "userId"=b."userId" AND "targetUserId"=b."targetUserId" AND version=b.version AND active=b.active) THEN RAISE EXCEPTION 'BLOCK_EVENT_REQUIRED';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER block_reconcile AFTER INSERT OR UPDATE ON "UserBlock" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION block_reconcile();
CREATE FUNCTION report_member_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.game='POKER' AND NOT EXISTS(SELECT 1 FROM "GameParticipant" WHERE "userId"=NEW."userId" AND "roomId"=NEW."gameId")) OR (NEW.game='SPADES' AND NOT EXISTS(SELECT 1 FROM "SpadesSeat" WHERE "userId"=NEW."userId" AND "roomId"=NEW."gameId")) THEN RAISE EXCEPTION 'REPORT_MEMBERSHIP';END IF;RETURN NEW;
END $$;
CREATE TRIGGER report_member_guard BEFORE INSERT ON "GameReport" FOR EACH ROW EXECUTE FUNCTION report_member_guard();
