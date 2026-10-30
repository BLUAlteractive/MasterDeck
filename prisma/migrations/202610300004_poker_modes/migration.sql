ALTER TABLE "Lobby" ADD COLUMN "rulesetVersion" text NOT NULL DEFAULT 'CLASSIC_NLHE_V1';
ALTER TABLE "Lobby" DROP CONSTRAINT "Lobby_mode_check";
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_mode_rules_check" CHECK (("mode"='CLASSIC' AND "rulesetVersion"='CLASSIC_NLHE_V1') OR ("mode"='EVOLVED' AND "rulesetVersion"='EVOLVED_A_EXPERIMENTAL_V1'));
CREATE FUNCTION lobby_rules_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='UPDATE' AND (NEW."mode"<>OLD."mode" OR NEW."rulesetVersion"<>OLD."rulesetVersion") THEN RAISE EXCEPTION 'immutable lobby rules'; END IF;
  IF NEW."mode"='EVOLVED' AND NEW."status"='STARTED' THEN RAISE EXCEPTION 'evolved balance review required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lobby_rules_guard BEFORE INSERT OR UPDATE ON "Lobby" FOR EACH ROW EXECUTE FUNCTION lobby_rules_immutable();
CREATE INDEX "Lobby_queue_rules_idx" ON "Lobby"("kind","mode","rulesetVersion","status","createdAt");
