-- CreateTable
CREATE TABLE "ProgressSource" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "policy" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressSource_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ProgressEvent" (
    "id" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProgressEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressGoal" (
    "id" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "policyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressCounter" (
    "userId" UUID NOT NULL,
    "goalId" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgressCounter_pkey" PRIMARY KEY ("userId","goalId","windowKey")
);

-- CreateTable
CREATE TABLE "ProgressConsumption" (
    "eventId" UUID NOT NULL,
    "goalId" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,

    CONSTRAINT "ProgressConsumption_pkey" PRIMARY KEY ("eventId","goalId","windowKey")
);

-- CreateTable
CREATE TABLE "ProgressAward" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "awardedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSource_kind_sourceId_key" ON "ProgressSource"("kind", "sourceId");

-- CreateIndex
CREATE INDEX "ProgressEvent_userId_occurredAt_id_idx" ON "ProgressEvent"("userId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressEvent_sourceKey_userId_kind_key" ON "ProgressEvent"("sourceKey", "userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressAward_userId_goalId_windowKey_key" ON "ProgressAward"("userId", "goalId", "windowKey");

-- AddForeignKey
ALTER TABLE "ProgressEvent" ADD CONSTRAINT "ProgressEvent_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "ProgressSource"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEvent" ADD CONSTRAINT "ProgressEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressCounter" ADD CONSTRAINT "ProgressCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressCounter" ADD CONSTRAINT "ProgressCounter_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ProgressGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressConsumption" ADD CONSTRAINT "ProgressConsumption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ProgressEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressConsumption" ADD CONSTRAINT "ProgressConsumption_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ProgressGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAward" ADD CONSTRAINT "ProgressAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAward" ADD CONSTRAINT "ProgressAward_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ProgressGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER progress_source_immutable BEFORE UPDATE OR DELETE ON "ProgressSource" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER progress_event_immutable BEFORE UPDATE OR DELETE ON "ProgressEvent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER progress_goal_immutable BEFORE UPDATE OR DELETE ON "ProgressGoal" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER progress_consumption_immutable BEFORE UPDATE OR DELETE ON "ProgressConsumption" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER progress_award_immutable BEFORE UPDATE OR DELETE ON "ProgressAward" FOR EACH ROW EXECUTE FUNCTION game_immutable();
ALTER TABLE "ProgressSource" ADD CHECK ("kind" IN ('POKER','SPADES','FUSION') AND "key"="kind"||':'||"sourceId"::text);
ALTER TABLE "ProgressGoal" ADD CHECK (("definition"->>'target')::integer BETWEEN 1 AND 1000000);
ALTER TABLE "ProgressCounter" ADD CHECK ("count">=0);
CREATE FUNCTION progress_event_source() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE s "ProgressSource"; t timestamptz; BEGIN
 SELECT * INTO STRICT s FROM "ProgressSource" WHERE "key"=NEW."sourceKey";
 IF s."kind"='POKER' AND NEW."kind" IN ('POKER_COMPLETED','POKER_WIN','POKER_FULL_HOUSE') THEN
  SELECT r."createdAt" INTO t FROM "GameResult" r JOIN "GameParticipant" p ON p."roomId"=r."roomId" WHERE r."roomId"=s."sourceId" AND p."userId"=NEW."userId";
 ELSIF s."kind"='SPADES' AND NEW."kind" IN ('SPADES_COMPLETED','SPADES_WIN') THEN
  SELECT r."createdAt" INTO t FROM "SpadesResult" r JOIN "SpadesSeat" p ON p."roomId"=r."roomId" WHERE r."roomId"=s."sourceId" AND p."userId"=NEW."userId";
 ELSIF s."kind"='FUSION' AND NEW."kind"='FUSION_COMPLETED' THEN
  SELECT "createdAt" INTO t FROM "FusionJob" WHERE "id"=s."sourceId" AND "ownerId"=NEW."userId";
 END IF;
 IF t IS NULL OR t IS DISTINCT FROM NEW."occurredAt" THEN RAISE EXCEPTION 'invalid progression source'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER progress_event_source BEFORE INSERT ON "ProgressEvent" FOR EACH ROW EXECUTE FUNCTION progress_event_source();
CREATE FUNCTION progress_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE uid uuid; gid text; win text; n integer; c integer; goal jsonb; BEGIN
 IF TG_TABLE_NAME='ProgressConsumption' THEN
  SELECT "userId" INTO uid FROM "ProgressEvent" WHERE "id"=NEW."eventId";
  IF (SELECT "kind" FROM "ProgressEvent" WHERE "id"=NEW."eventId") IS DISTINCT FROM (SELECT "definition"->>'kind' FROM "ProgressGoal" WHERE "id"=NEW."goalId") THEN RAISE EXCEPTION 'wrong goal kind'; END IF;
 ELSE uid:=NEW."userId"; END IF;
 gid:=NEW."goalId";win:=NEW."windowKey";
 SELECT "definition" INTO STRICT goal FROM "ProgressGoal" WHERE "id"=gid;
 SELECT count(*) INTO n FROM "ProgressConsumption" c JOIN "ProgressEvent" e ON e."id"=c."eventId" WHERE e."userId"=uid AND c."goalId"=gid AND c."windowKey"=win;
 SELECT "count" INTO c FROM "ProgressCounter" WHERE "userId"=uid AND "goalId"=gid AND "windowKey"=win;
 IF c IS DISTINCT FROM n OR n>(goal->>'target')::integer THEN RAISE EXCEPTION 'progress counter mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM "ProgressAward" WHERE "userId"=uid AND "goalId"=gid AND "windowKey"=win AND (n<>(goal->>'target')::integer OR "badge" IS DISTINCT FROM goal->>'badge')) THEN RAISE EXCEPTION 'invalid progression award'; END IF;
 IF n=(goal->>'target')::integer AND NOT EXISTS(SELECT 1 FROM "ProgressAward" WHERE "userId"=uid AND "goalId"=gid AND "windowKey"=win) THEN RAISE EXCEPTION 'missing progression award'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER progress_counter_consistent AFTER INSERT OR UPDATE ON "ProgressCounter" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION progress_consistent();
CREATE CONSTRAINT TRIGGER progress_consumption_consistent AFTER INSERT ON "ProgressConsumption" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION progress_consistent();
CREATE CONSTRAINT TRIGGER progress_award_consistent AFTER INSERT ON "ProgressAward" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION progress_consistent();
CREATE FUNCTION progress_counter_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable progress counter'; END IF;
 IF NEW."userId"<>OLD."userId" OR NEW."goalId"<>OLD."goalId" OR NEW."windowKey"<>OLD."windowKey" OR NEW."count"<>OLD."count"+1 THEN RAISE EXCEPTION 'invalid progress transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER progress_counter_transition BEFORE UPDATE OR DELETE ON "ProgressCounter" FOR EACH ROW EXECUTE FUNCTION progress_counter_transition();
