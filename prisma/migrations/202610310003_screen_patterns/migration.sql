-- CreateTable
CREATE TABLE "ScreenPattern" (
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

    CONSTRAINT "ScreenPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenReview" (
    "patternId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "review" TEXT NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenReview_pkey" PRIMARY KEY ("patternId","review")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScreenPattern_slug_version_key" ON "ScreenPattern"("slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenReview_patternId_reviewerId_key" ON "ScreenReview"("patternId", "reviewerId");

ALTER TABLE "ScreenPattern" ADD FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ScreenPattern" ADD FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ScreenReview" ADD FOREIGN KEY ("patternId") REFERENCES "ScreenPattern"("id") ON DELETE RESTRICT;
ALTER TABLE "ScreenReview" ADD FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ScreenPattern" ADD CHECK (status IN ('DRAFT','PUBLISHED','RETIRED') AND version>0 AND "stateVersion">0 AND "definitionHash"~'^[a-f0-9]{64}$');
ALTER TABLE "ScreenReview" ADD CHECK (review IN ('CONTENT','ECONOMY') AND length(evidence)>=8);
CREATE TRIGGER screen_pattern_review_immutable BEFORE UPDATE OR DELETE ON "ScreenReview" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION screen_pattern_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SCREEN_HISTORY_RETAINED';END IF;
 IF TG_OP='INSERT' THEN IF NEW.status<>'DRAFT' OR NEW."stateVersion"<>1 OR NEW."publisherId" IS NOT NULL THEN RAISE EXCEPTION 'SCREEN_DRAFT_REQUIRED';END IF;RETURN NEW;END IF;
 IF (to_jsonb(NEW)-'status'-'stateVersion'-'publisherId')<>(to_jsonb(OLD)-'status'-'stateVersion'-'publisherId') OR NEW."stateVersion"<>OLD."stateVersion"+1 OR NOT(OLD.status='DRAFT' AND NEW.status='PUBLISHED' OR OLD.status='PUBLISHED' AND NEW.status='RETIRED') OR OLD."publisherId" IS NOT NULL AND NEW."publisherId" IS DISTINCT FROM OLD."publisherId" THEN RAISE EXCEPTION 'SCREEN_VERSION_IMMUTABLE';END IF;
 IF NEW.status='PUBLISHED' AND (NEW."publisherId" IS NULL OR NEW."publisherId"=NEW."creatorId" OR (SELECT count(*) FROM "ScreenReview" WHERE "patternId"=NEW.id AND "definitionHash"=NEW."definitionHash" AND "reviewerId" NOT IN(NEW."creatorId",NEW."publisherId"))<>2) THEN RAISE EXCEPTION 'SCREEN_REVIEW_REQUIRED';END IF;RETURN NEW;
END $$;
CREATE TRIGGER screen_pattern_definition_guard BEFORE INSERT OR UPDATE OR DELETE ON "ScreenPattern" FOR EACH ROW EXECUTE FUNCTION screen_pattern_definition_guard();
CREATE FUNCTION screen_pattern_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ScreenPattern" WHERE id=NEW."patternId" AND status='DRAFT' AND "creatorId"<>NEW."reviewerId" AND "definitionHash"=NEW."definitionHash") THEN RAISE EXCEPTION 'SCREEN_REVIEW_SCOPE';END IF;RETURN NEW;
END $$;
CREATE TRIGGER screen_pattern_review_guard BEFORE INSERT ON "ScreenReview" FOR EACH ROW EXECUTE FUNCTION screen_pattern_review_guard();
CREATE FUNCTION screen_pattern_change_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "AdminAction" WHERE scope=NEW.id::text AND action=CASE WHEN TG_OP='INSERT' THEN 'SCREEN_DRAFT' WHEN NEW.status='PUBLISHED' THEN 'SCREEN_PUBLISH' ELSE 'SCREEN_RETIRE' END AND (result->>'stateVersion')::int=NEW."stateVersion") THEN RAISE EXCEPTION 'SCREEN_AUDIT_REQUIRED';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER screen_pattern_change_audit AFTER INSERT OR UPDATE ON "ScreenPattern" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION screen_pattern_change_audit();

ALTER TABLE "ScreenPattern" ADD CHECK (COALESCE(definition->>'currency'='TRAIL_CREDITS' AND definition->'consumable'='true'::jsonb AND jsonb_typeof(definition->'name')='string' AND length(definition->>'name') BETWEEN 3 AND 100 AND jsonb_typeof(definition->'creditPrice')='number' AND jsonb_typeof(definition->'requiredSteps')='number' AND jsonb_typeof(definition->'requiredTrailInk')='number' AND jsonb_typeof(definition->'sourceLevel')='number' AND jsonb_typeof(definition->'targetLevel')='number' AND (definition->>'creditPrice')::int BETWEEN 1 AND 1000000 AND (definition->>'requiredSteps')::int BETWEEN 1 AND 1000000 AND (definition->>'requiredTrailInk')::int BETWEEN 0 AND 1000 AND definition->>'visualThemeId'='ORIGINAL_PLATEN_V1' AND definition->>'cancelAfterProgress' IN('DISABLED','FORFEIT_SCREEN') AND length(definition->>'ruleVersion')>0 AND ((definition->>'branch'='BLUE' AND definition->>'sourceLevel'='1' AND definition->>'targetLevel'='3' AND definition->>'tier'='BASIC') OR (definition->>'branch'='RED' AND definition->>'sourceLevel'='2' AND definition->>'targetLevel'='4' AND definition->>'tier'='FINE') OR (definition->>'branch'='BLUE' AND definition->>'sourceLevel'='3' AND definition->>'targetLevel'='5' AND definition->>'tier'='MASTER') OR (definition->>'branch'='RED' AND definition->>'sourceLevel'='4' AND definition->>'targetLevel'='6' AND definition->>'tier'='MASTER')),false) AND definition-ARRAY['name','tier','branch','sourceLevel','targetLevel','requiredSteps','requiredTrailInk','creditPrice','currency','consumable','ruleVersion','visualThemeId','cancelAfterProgress']='{}'::jsonb);
