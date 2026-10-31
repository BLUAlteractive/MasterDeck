-- CreateTable
CREATE TABLE "PackDefinition" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "creatorId" UUID NOT NULL,
    "publisherId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackReview" (
    "packId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "review" TEXT NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackReview_pkey" PRIMARY KEY ("packId","review")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackDefinition_slug_version_key" ON "PackDefinition"("slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PackReview_packId_reviewerId_key" ON "PackReview"("packId", "reviewerId");

ALTER TABLE "PackDefinition" ADD FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PackDefinition" ADD FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PackReview" ADD FOREIGN KEY ("packId") REFERENCES "PackDefinition"("id") ON DELETE RESTRICT;
ALTER TABLE "PackReview" ADD FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PackDefinition" ADD CHECK (status IN ('DRAFT','PUBLISHED','RETIRED') AND version>0 AND "stateVersion">0 AND "definitionHash"~'^[a-f0-9]{64}$');
ALTER TABLE "PackReview" ADD CHECK (review IN ('CONTENT','ECONOMY') AND length(evidence)>=8);
CREATE TRIGGER pack_review_immutable BEFORE UPDATE OR DELETE ON "PackReview" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION pack_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PACK_HISTORY_RETAINED';END IF;
 IF TG_OP='INSERT' THEN IF NEW.status<>'DRAFT' OR NEW."stateVersion"<>1 OR NEW."publisherId" IS NOT NULL THEN RAISE EXCEPTION 'PACK_DRAFT_REQUIRED';END IF;RETURN NEW;END IF;
 IF (to_jsonb(NEW)-'status'-'stateVersion'-'publisherId')<>(to_jsonb(OLD)-'status'-'stateVersion'-'publisherId') OR NEW."stateVersion"<>OLD."stateVersion"+1 OR NOT(OLD.status='DRAFT' AND NEW.status='PUBLISHED' OR OLD.status='PUBLISHED' AND NEW.status='RETIRED') OR OLD."publisherId" IS NOT NULL AND NEW."publisherId" IS DISTINCT FROM OLD."publisherId" THEN RAISE EXCEPTION 'PACK_VERSION_IMMUTABLE';END IF;
 IF NEW.status='PUBLISHED' AND (NEW."publisherId" IS NULL OR NEW."publisherId"=NEW."creatorId" OR (SELECT count(*) FROM "PackReview" WHERE "packId"=NEW.id AND "definitionHash"=NEW."definitionHash" AND "reviewerId" NOT IN(NEW."creatorId",NEW."publisherId"))<>2) THEN RAISE EXCEPTION 'PACK_REVIEW_REQUIRED';END IF;RETURN NEW;
END $$;
CREATE TRIGGER pack_definition_guard BEFORE INSERT OR UPDATE OR DELETE ON "PackDefinition" FOR EACH ROW EXECUTE FUNCTION pack_definition_guard();
CREATE FUNCTION pack_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PackDefinition" WHERE id=NEW."packId" AND status='DRAFT' AND "creatorId"<>NEW."reviewerId" AND "definitionHash"=NEW."definitionHash") THEN RAISE EXCEPTION 'PACK_REVIEW_SCOPE';END IF;RETURN NEW;
END $$;
CREATE TRIGGER pack_review_guard BEFORE INSERT ON "PackReview" FOR EACH ROW EXECUTE FUNCTION pack_review_guard();
CREATE FUNCTION pack_change_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "AdminAction" WHERE scope=NEW.id::text AND action=CASE WHEN TG_OP='INSERT' THEN 'PACK_DRAFT' WHEN NEW.status='PUBLISHED' THEN 'PACK_PUBLISH' ELSE 'PACK_RETIRE' END AND (result->>'stateVersion')::int=NEW."stateVersion") THEN RAISE EXCEPTION 'PACK_AUDIT_REQUIRED';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pack_change_audit AFTER INSERT OR UPDATE ON "PackDefinition" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pack_change_audit();
