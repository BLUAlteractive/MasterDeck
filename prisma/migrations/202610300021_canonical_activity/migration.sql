-- CreateTable
CREATE TABLE "ActivityBatch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "proofKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySource" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "requestHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "acceptedSteps" INTEGER NOT NULL,
    "reason" TEXT,
    "startAt" TIMESTAMPTZ(3),
    "endAt" TIMESTAMPTZ(3),
    "batchId" UUID NOT NULL,

    CONSTRAINT "ActivitySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityDay" (
    "userId" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "acceptedSteps" INTEGER NOT NULL DEFAULT 0,
    "grantedCredits" INTEGER NOT NULL DEFAULT 0,
    "policy" JSONB NOT NULL,

    CONSTRAINT "ActivityDay_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "ActivityAllocation" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "transferId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityReview" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "requestHash" TEXT NOT NULL,
    "stepAdjustment" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityBatch_userId_proofKey_key" ON "ActivityBatch"("userId", "proofKey");

-- CreateIndex
CREATE INDEX "ActivitySource_userId_day_idx" ON "ActivitySource"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySource_userId_sourceKey_key" ON "ActivitySource"("userId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityAllocation_transferId_key" ON "ActivityAllocation"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityAllocation_batchId_channel_targetId_key" ON "ActivityAllocation"("batchId", "channel", "targetId");

-- CreateIndex
CREATE INDEX "ActivityReview_userId_idx" ON "ActivityReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityReview_sourceId_revision_key" ON "ActivityReview"("sourceId", "revision");


ALTER TABLE "ActivityBatch" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivitySource" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivitySource" ADD FOREIGN KEY ("batchId") REFERENCES "ActivityBatch"("id") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ActivityDay" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivityAllocation" ADD FOREIGN KEY ("batchId") REFERENCES "ActivityBatch"("id") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ActivityAllocation" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivityAllocation" ADD FOREIGN KEY ("transferId") REFERENCES "RestrictedTransfer"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivityReview" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivityReview" ADD FOREIGN KEY ("sourceId") REFERENCES "ActivitySource"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivitySource" ADD CHECK (source IN ('HEALTHKIT','HEALTH_CONNECT') AND revision>0 AND "acceptedSteps" BETWEEN 0 AND 200000 AND (("startAt" IS NULL AND "endAt" IS NULL) OR ("startAt" IS NOT NULL AND "endAt">"startAt")) AND ("acceptedSteps">0)=(reason IS NULL));
ALTER TABLE "ActivityDay" ADD CHECK ("acceptedSteps">=0 AND "grantedCredits">=0 AND day ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "ActivityAllocation" ADD CHECK (units>0 AND channel IN ('TRAIL_CREDITS','PRESS_STEPS') AND (channel='TRAIL_CREDITS')=("transferId" IS NOT NULL));
CREATE UNIQUE INDEX activity_one_press_allocation ON "ActivityAllocation"("batchId") WHERE channel='PRESS_STEPS';
CREATE TRIGGER activity_batch_immutable BEFORE UPDATE OR DELETE ON "ActivityBatch" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER activity_allocation_immutable BEFORE UPDATE OR DELETE ON "ActivityAllocation" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER activity_review_immutable BEFORE UPDATE OR DELETE ON "ActivityReview" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION activity_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ACTIVITY_SOURCE_RETAINED'; END IF;
 IF (to_jsonb(NEW)-'startAt'-'endAt')<>(to_jsonb(OLD)-'startAt'-'endAt') OR NEW."startAt" IS NOT NULL OR NEW."endAt" IS NOT NULL THEN RAISE EXCEPTION 'ACTIVITY_SOURCE_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER activity_source_guard BEFORE UPDATE OR DELETE ON "ActivitySource" FOR EACH ROW EXECUTE FUNCTION activity_source_guard();
CREATE FUNCTION activity_day_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ACTIVITY_DAY_RETAINED'; END IF;
 IF NEW."userId"<>OLD."userId" OR NEW.day<>OLD.day OR NEW.policy<>OLD.policy OR NEW."acceptedSteps"<OLD."acceptedSteps" OR NEW."grantedCredits"<OLD."grantedCredits" THEN RAISE EXCEPTION 'ACTIVITY_DAY_MONOTONE'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER activity_day_guard BEFORE UPDATE OR DELETE ON "ActivityDay" FOR EACH ROW EXECUTE FUNCTION activity_day_guard();
CREATE FUNCTION activity_day_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE uid uuid; d text; actual "ActivityDay"; BEGIN
 uid:=NEW."userId";
 IF TG_TABLE_NAME='ActivityAllocation' THEN IF NEW.channel<>'TRAIL_CREDITS' THEN RETURN NULL; END IF; d:=NEW."targetId"; ELSE d:=NEW.day; END IF;
 SELECT * INTO actual FROM "ActivityDay" WHERE "userId"=uid AND day=d;
 IF actual."acceptedSteps" IS DISTINCT FROM (SELECT COALESCE(sum("acceptedSteps"),0) FROM "ActivitySource" WHERE "userId"=uid AND day=d) OR actual."grantedCredits" IS DISTINCT FROM (SELECT COALESCE(sum(units),0) FROM "ActivityAllocation" WHERE "userId"=uid AND channel='TRAIL_CREDITS' AND "targetId"=d) OR actual."grantedCredits">LEAST((actual.policy->>'dailyCreditCap')::int,actual."acceptedSteps"/(actual.policy->>'stepsPerCredit')::int) THEN RAISE EXCEPTION 'ACTIVITY_DAY_RECONCILIATION'; END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER activity_day_consistent AFTER INSERT OR UPDATE ON "ActivityDay" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION activity_day_consistent();
CREATE FUNCTION activity_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE t "RestrictedTransfer"; BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ActivityBatch" WHERE id=NEW."batchId" AND "userId"=NEW."userId") THEN RAISE EXCEPTION 'ACTIVITY_BATCH_OWNER'; END IF;
 IF NEW.channel='PRESS_STEPS' AND NEW.units>(SELECT COALESCE(sum("acceptedSteps"),0) FROM "ActivitySource" WHERE "batchId"=NEW."batchId") THEN RAISE EXCEPTION 'ACTIVITY_PRESS_UNITS'; END IF;
 IF NEW.channel='TRAIL_CREDITS' THEN
  SELECT * INTO STRICT t FROM "RestrictedTransfer" WHERE id=NEW."transferId";
  IF t.currency<>'TRAIL_CREDITS' OR t.purpose<>'EARN_ACTIVITY' OR NOT EXISTS(SELECT 1 FROM "RestrictedEntry" e JOIN "RestrictedAccount" a ON a.id=e."accountId" WHERE e."transferId"=t.id AND a."userId"=NEW."userId" AND e.amount=NEW.units) THEN RAISE EXCEPTION 'ACTIVITY_LEDGER_LINK'; END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER activity_allocation_guard AFTER INSERT ON "ActivityAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION activity_allocation_guard();
CREATE FUNCTION activity_review_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ActivitySource" WHERE id=NEW."sourceId" AND "userId"=NEW."userId") THEN RAISE EXCEPTION 'ACTIVITY_REVIEW_OWNER'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER activity_review_owner BEFORE INSERT ON "ActivityReview" FOR EACH ROW EXECUTE FUNCTION activity_review_owner();

CREATE CONSTRAINT TRIGGER activity_source_day_consistent AFTER INSERT ON "ActivitySource" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW."acceptedSteps">0) EXECUTE FUNCTION activity_day_consistent();
CREATE CONSTRAINT TRIGGER activity_allocation_day_consistent AFTER INSERT ON "ActivityAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION activity_day_consistent();
CREATE FUNCTION activity_source_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ActivityBatch" WHERE id=NEW."batchId" AND "userId"=NEW."userId") THEN RAISE EXCEPTION 'ACTIVITY_SOURCE_BATCH_OWNER'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER activity_source_owner AFTER INSERT ON "ActivitySource" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION activity_source_owner();
