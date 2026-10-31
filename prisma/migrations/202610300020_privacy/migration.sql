-- CreateTable
CREATE TABLE "PrivacyChoice" (
    "userId" UUID NOT NULL,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "activityUpload" BOOLEAN NOT NULL DEFAULT false,
    "foregroundLocation" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PrivacyChoice_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PrivacyConsent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyDeletionJob" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING_CONFIG',
    "version" INTEGER NOT NULL DEFAULT 1,
    "leaseUntil" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyDeletionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyDeletionProof" (
    "jobId" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "referenceHash" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyDeletionProof_pkey" PRIMARY KEY ("jobId","identityId")
);

-- CreateTable
CREATE TABLE "IdentityTombstone" (
    "issuer" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "jobId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityTombstone_pkey" PRIMARY KEY ("issuer","subjectHash")
);

-- CreateTable
CREATE TABLE "PrivacyAccessEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivacyConsent_userId_id_idx" ON "PrivacyConsent"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyConsent_userId_commandId_key" ON "PrivacyConsent"("userId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyDeletionJob_requestId_key" ON "PrivacyDeletionJob"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyDeletionJob_userId_key" ON "PrivacyDeletionJob"("userId");


ALTER TABLE "PrivacyChoice" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PrivacyConsent" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PrivacyAccessEvent" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PrivacyDeletionJob" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PrivacyDeletionJob" ADD FOREIGN KEY ("requestId") REFERENCES "DeletionRequest"("id") ON DELETE RESTRICT;
ALTER TABLE "PrivacyDeletionProof" ADD FOREIGN KEY ("jobId") REFERENCES "PrivacyDeletionJob"("id") ON DELETE RESTRICT;
ALTER TABLE "PrivacyDeletionProof" ADD FOREIGN KEY ("identityId") REFERENCES "ExternalIdentity"("id") ON DELETE RESTRICT;
ALTER TABLE "IdentityTombstone" ADD FOREIGN KEY ("jobId") REFERENCES "PrivacyDeletionJob"("id") ON DELETE RESTRICT;
ALTER TABLE "PrivacyConsent" ADD CHECK (purpose IN ('ANALYTICS','ACTIVITY_UPLOAD','FOREGROUND_LOCATION'));
ALTER TABLE "PrivacyDeletionProof" ADD CHECK ("referenceHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "IdentityTombstone" ADD CHECK ("subjectHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "PrivacyDeletionJob" ADD CHECK (status IN ('WAITING_CONFIG','WAITING_GAME','PROCESSING','RETRY','COMPLETED_WITH_RETAINED_RECORDS') AND version>0);
CREATE TRIGGER privacy_consent_immutable BEFORE UPDATE OR DELETE ON "PrivacyConsent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER privacy_access_immutable BEFORE UPDATE OR DELETE ON "PrivacyAccessEvent" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER privacy_proof_immutable BEFORE UPDATE OR DELETE ON "PrivacyDeletionProof" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER privacy_tombstone_immutable BEFORE UPDATE OR DELETE ON "IdentityTombstone" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION privacy_choice_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM "User" WHERE id=OLD."userId" AND status='DELETED') THEN RAISE EXCEPTION 'PRIVACY_CHOICE_DELETE'; END IF; RETURN OLD;
 END IF;
 IF TG_OP='INSERT' AND (NEW.version<>0 OR NEW.analytics OR NEW."activityUpload" OR NEW."foregroundLocation") THEN RAISE EXCEPTION 'PRIVACY_DEFAULT'; END IF;
 IF TG_OP='UPDATE' AND (NEW."userId"<>OLD."userId" OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'PRIVACY_VERSION'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_choice_guard BEFORE INSERT OR UPDATE OR DELETE ON "PrivacyChoice" FOR EACH ROW EXECUTE FUNCTION privacy_choice_guard();
CREATE FUNCTION privacy_choice_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PrivacyChoice" WHERE "userId"=NEW."userId") THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM "PrivacyConsent" WHERE "userId"=NEW."userId" AND state=jsonb_build_object('analytics',NEW.analytics,'activityUpload',NEW."activityUpload",'foregroundLocation',NEW."foregroundLocation",'version',NEW.version)) THEN RAISE EXCEPTION 'PRIVACY_CONSENT_REQUIRED'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER privacy_choice_evidence AFTER UPDATE ON "PrivacyChoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION privacy_choice_evidence();
CREATE FUNCTION privacy_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PRIVACY_JOB_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "DeletionRequest" WHERE id=NEW."requestId" AND "userId"=NEW."userId") THEN RAISE EXCEPTION 'PRIVACY_REQUEST_REQUIRED'; END IF;
 IF TG_OP='INSERT' AND (NEW.status<>'WAITING_CONFIG' OR NEW.version<>1) THEN RAISE EXCEPTION 'PRIVACY_INITIAL_STATE'; END IF;
 IF TG_OP='UPDATE' AND (OLD.status='COMPLETED_WITH_RETAINED_RECORDS' OR NEW.id<>OLD.id OR NEW."userId"<>OLD."userId" OR NEW."requestId"<>OLD."requestId" OR NEW.version<>OLD.version+1 OR NEW."createdAt"<>OLD."createdAt") THEN RAISE EXCEPTION 'PRIVACY_JOB_VERSION'; END IF;
 IF (NEW.status='PROCESSING')<>(NEW."leaseUntil" IS NOT NULL) OR (NEW.status='COMPLETED_WITH_RETAINED_RECORDS')<>(NEW."completedAt" IS NOT NULL) THEN RAISE EXCEPTION 'PRIVACY_JOB_STATE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_job_guard BEFORE INSERT OR UPDATE OR DELETE ON "PrivacyDeletionJob" FOR EACH ROW EXECUTE FUNCTION privacy_job_guard();
CREATE FUNCTION privacy_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status<>'COMPLETED_WITH_RETAINED_RECORDS' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."userId" AND status='DELETED') OR EXISTS(SELECT 1 FROM "CardInstance" WHERE "ownerId"=NEW."userId" AND status='LOCKED') OR EXISTS(SELECT 1 FROM "AuthSession" s JOIN "ExternalIdentity" i ON i.id=s."identityId" WHERE i."userId"=NEW."userId") OR EXISTS(SELECT 1 FROM "ExternalIdentity" i WHERE i."userId"=NEW."userId" AND (i.subject NOT LIKE 'erased:%' OR NOT EXISTS(SELECT 1 FROM "PrivacyDeletionProof" p WHERE p."jobId"=NEW.id AND p."identityId"=i.id) OR NOT EXISTS(SELECT 1 FROM "IdentityTombstone" t WHERE t."jobId"=NEW.id AND t.issuer=i.issuer AND i.subject='erased:'||t."subjectHash"))) THEN RAISE EXCEPTION 'PRIVACY_COMPLETION_UNPROVEN'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER privacy_completion_guard AFTER UPDATE ON "PrivacyDeletionJob" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION privacy_completion_guard();
INSERT INTO "PrivacyDeletionJob"(id,"requestId","userId") SELECT id,id,"userId" FROM "DeletionRequest";

-- B005 revocation tombstones may only be purged after verified provider removal in a deletion transaction.
CREATE OR REPLACE FUNCTION protect_auth_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM "ExternalIdentity" i JOIN "User" u ON u.id=i."userId" JOIN "PrivacyDeletionJob" j ON j."userId"=u.id JOIN "PrivacyDeletionProof" p ON p."jobId"=j.id AND p."identityId"=i.id WHERE i.id=OLD."identityId" AND u.status='DELETED' AND j.status='PROCESSING' AND i.subject LIKE 'erased:%') THEN RAISE EXCEPTION 'session revocation tombstones are retained' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF ROW(NEW.id,NEW."identityId",NEW."providerSessionId",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."identityId",OLD."providerSessionId",OLD."createdAt") OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN RAISE EXCEPTION 'session identity and revocation are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE INDEX "PrivacyDeletionJob_nextAttemptAt_idx" ON "PrivacyDeletionJob"("nextAttemptAt") WHERE status<>'COMPLETED_WITH_RETAINED_RECORDS';
CREATE FUNCTION privacy_proof_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PrivacyDeletionJob" j JOIN "ExternalIdentity" i ON i."userId"=j."userId" WHERE j.id=NEW."jobId" AND i.id=NEW."identityId" AND j.status='PROCESSING') THEN RAISE EXCEPTION 'PRIVACY_PROOF_OWNER'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER privacy_proof_owner BEFORE INSERT ON "PrivacyDeletionProof" FOR EACH ROW EXECUTE FUNCTION privacy_proof_owner();
