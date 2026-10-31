-- Refine legacy ADMIN tournament authority. Existing audit history remains unchanged.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='"AdminCapability"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%CONTENT_EDITOR%' LOOP EXECUTE format('ALTER TABLE "AdminCapability" DROP CONSTRAINT %I',c.conname);END LOOP;
END $$;
ALTER TABLE "AdminCapability" ADD CONSTRAINT admin_capability_scopes CHECK (capability IN ('CONTENT_EDITOR','CONTENT_REVIEWER','CONTENT_PUBLISHER','PRODUCT_OPERATOR','SUPPORT','AUDITOR','PRIVACY_OPERATOR','RELEASE_OPERATOR','GAME_OPERATOR') AND length("grantedBy")>=8);
CREATE FUNCTION tournament_operator_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "AdminCapability" WHERE "userId"=NEW."actorId" AND capability='GAME_OPERATOR' AND "revokedAt" IS NULL) THEN RAISE EXCEPTION 'GAME_OPERATOR_REQUIRED';END IF;RETURN NEW;
END $$;
CREATE TRIGGER tournament_operator_guard BEFORE INSERT ON "TournamentAudit" FOR EACH ROW EXECUTE FUNCTION tournament_operator_guard();
