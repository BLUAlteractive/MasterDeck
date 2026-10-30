-- CreateTable
CREATE TABLE "AccessibleQuestEnrollment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "policy" JSONB NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AccessibleQuestEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessibleQuestFact" (
    "userId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,

    CONSTRAINT "AccessibleQuestFact_pkey" PRIMARY KEY ("userId","sourceKey")
);

-- CreateTable
CREATE TABLE "AccessibleQuestCompletion" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "receipt" JSONB NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessibleQuestCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessibleQuestEnrollment_userId_goalId_windowKey_key" ON "AccessibleQuestEnrollment"("userId", "goalId", "windowKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccessibleQuestFact_eventId_key" ON "AccessibleQuestFact"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessibleQuestCompletion_enrollmentId_key" ON "AccessibleQuestCompletion"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessibleQuestCompletion_transferId_key" ON "AccessibleQuestCompletion"("transferId");

-- AddForeignKey
ALTER TABLE "AccessibleQuestEnrollment" ADD CONSTRAINT "AccessibleQuestEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessibleQuestEnrollment" ADD CONSTRAINT "AccessibleQuestEnrollment_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ProgressGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessibleQuestFact" ADD CONSTRAINT "AccessibleQuestFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessibleQuestFact" ADD CONSTRAINT "AccessibleQuestFact_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "AccessibleQuestEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessibleQuestFact" ADD CONSTRAINT "AccessibleQuestFact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ProgressEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessibleQuestCompletion" ADD CONSTRAINT "AccessibleQuestCompletion_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "AccessibleQuestEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessibleQuestCompletion" ADD CONSTRAINT "AccessibleQuestCompletion_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "RestrictedTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX accessible_one_active ON "AccessibleQuestEnrollment"("userId") WHERE "status"='ACTIVE';
ALTER TABLE "AccessibleQuestEnrollment" ADD CHECK ("status" IN ('ACTIVE','COMPLETED','EXPIRED','CANCELLED') AND "version">0 AND "expiresAt">"startedAt");
CREATE FUNCTION accessible_enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable quest evidence';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'ACTIVE' OR NEW."version"<>1 OR NEW."definition" IS DISTINCT FROM (SELECT "definition" FROM "ProgressGoal" WHERE "id"=NEW."goalId") OR progress_window(NEW."definition",NEW."startedAt") IS DISTINCT FROM NEW."windowKey" OR NEW."expiresAt">(NEW."definition"->>'endsAt')::timestamptz THEN RAISE EXCEPTION 'invalid quest enrollment';END IF;
 ELSE
  IF NEW."id"<>OLD."id" OR NEW."userId"<>OLD."userId" OR NEW."goalId"<>OLD."goalId" OR NEW."windowKey"<>OLD."windowKey" OR NEW."definition"<>OLD."definition" OR NEW."policy"<>OLD."policy" OR NEW."startedAt"<>OLD."startedAt" OR NEW."expiresAt"<>OLD."expiresAt" OR OLD."status"<>'ACTIVE' OR NEW."status"='ACTIVE' OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'invalid quest transition';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER accessible_enrollment_guard BEFORE INSERT OR UPDATE OR DELETE ON "AccessibleQuestEnrollment" FOR EACH ROW EXECUTE FUNCTION accessible_enrollment_guard();
CREATE TRIGGER accessible_fact_immutable BEFORE UPDATE OR DELETE ON "AccessibleQuestFact" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER accessible_completion_immutable BEFORE UPDATE OR DELETE ON "AccessibleQuestCompletion" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION accessible_complete_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE earned numeric; eid uuid; e "AccessibleQuestEnrollment"; c "AccessibleQuestCompletion"; t "RestrictedTransfer"; config jsonb; n integer; amount bigint; BEGIN
 IF TG_TABLE_NAME='AccessibleQuestEnrollment' THEN eid:=NEW."id";
 ELSIF TG_TABLE_NAME='RestrictedTransfer' THEN
  IF NEW."purpose"<>'EARN_ACCESSIBLE_QUEST' THEN RETURN NULL;END IF;
  SELECT "enrollmentId" INTO eid FROM "AccessibleQuestCompletion" WHERE "transferId"=NEW."id";
  IF eid IS NULL THEN RAISE EXCEPTION 'accessible quest proof required';END IF;
 ELSE eid:=NEW."enrollmentId";END IF;
 SELECT * INTO STRICT e FROM "AccessibleQuestEnrollment" WHERE "id"=eid;
 SELECT * INTO c FROM "AccessibleQuestCompletion" WHERE "enrollmentId"=eid;
 SELECT count(*) INTO n FROM "AccessibleQuestFact" WHERE "enrollmentId"=eid;
 IF e."status"<>'COMPLETED' THEN IF c."id" IS NOT NULL OR n<>0 THEN RAISE EXCEPTION 'uncompleted quest consumed evidence';END IF;RETURN NULL;END IF;
 IF c."id" IS NULL OR n<>(e."definition"->>'target')::integer THEN RAISE EXCEPTION 'incomplete accessible quest';END IF;
 IF EXISTS(SELECT 1 FROM "AccessibleQuestFact" f JOIN "ProgressEvent" p ON p."id"=f."eventId" JOIN "ProgressSource" s ON s."key"=p."sourceKey" WHERE f."enrollmentId"=eid AND (f."userId"<>e."userId" OR p."userId"<>e."userId" OR f."sourceKey"<>p."sourceKey" OR p."kind"<>e."definition"->>'kind' OR p."occurredAt"<=e."startedAt" OR p."occurredAt">=e."expiresAt" OR (s."policy"->'requirePermanent') IS DISTINCT FROM e."policy"->'requirePermanent' OR (s."policy"->'minimumOpponents') IS DISTINCT FROM e."policy"->'minimumOpponents' OR (s."policy"->'minimumPlayerCommands') IS DISTINCT FROM e."policy"->'minimumPlayerCommands')) THEN RAISE EXCEPTION 'invalid accessible quest fact';END IF;
 SELECT a INTO config FROM jsonb_array_elements(e."policy"->'goals') a WHERE a->>'goalId'=e."goalId";
 SELECT * INTO t FROM "RestrictedTransfer" WHERE "id"=c."transferId";
 SELECT x."amount" INTO amount FROM "RestrictedEntry" x JOIN "RestrictedAccount" a ON a."id"=x."accountId" WHERE x."transferId"=t."id" AND a."userId"=e."userId";
 IF config IS NULL OR t."purpose"<>'EARN_ACCESSIBLE_QUEST' OR t."currency"<>'TRAIL_CREDITS' OR t."proofReference"<>c."id"::text OR t."sourceKey"<>'accessible:'||c."id"::text OR amount IS DISTINCT FROM (config->>'trailCredits')::bigint OR c."receipt"->>'id'<>c."id"::text OR c."receipt"->>'enrollmentId'<>eid::text OR c."receipt"->>'transferId'<>t."id"::text OR c."receipt"->>'trailCredits'<>amount::text OR c."receipt"->'pressProof'->>'kind'<>'ACCESSIBLE_QUEST' OR c."receipt"->'pressProof'->>'recipeId'<>config->>'pressRecipeId' THEN RAISE EXCEPTION 'invalid accessible reward';END IF;
 SELECT COALESCE(sum(x."amount"),0) INTO earned FROM "RestrictedEntry" x JOIN "RestrictedAccount" a ON a."id"=x."accountId" JOIN "RestrictedTransfer" r ON r."id"=x."transferId" WHERE a."userId"=e."userId" AND r."currency"='TRAIL_CREDITS' AND r."purpose" IN ('EARN_ACTIVITY','EARN_ACCESSIBLE_QUEST') AND x."amount">0 AND r."createdAt">=(date_trunc('day',t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AND r."createdAt"<(date_trunc('day',t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 day';
 IF earned>(e."policy"->>'maxTrailPerDay')::numeric OR t."policyVersion"<>e."policy"->>'version' OR c."receipt"->'pressProof'->>'equivalencePlanId'<>config->>'equivalencePlanId' THEN RAISE EXCEPTION 'invalid accessible cap or plan';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accessible_enrollment_complete AFTER INSERT OR UPDATE ON "AccessibleQuestEnrollment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accessible_complete_consistent();
CREATE CONSTRAINT TRIGGER accessible_fact_complete AFTER INSERT ON "AccessibleQuestFact" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accessible_complete_consistent();
CREATE CONSTRAINT TRIGGER accessible_completion_complete AFTER INSERT ON "AccessibleQuestCompletion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accessible_complete_consistent();
CREATE CONSTRAINT TRIGGER accessible_ledger_proof AFTER INSERT ON "RestrictedTransfer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accessible_complete_consistent();
