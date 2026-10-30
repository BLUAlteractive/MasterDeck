DROP TRIGGER spades_lobby_consistent ON "Lobby";
DROP FUNCTION spades_lobby_consistent();
-- Destructive owned-test rollback only; deployed recovery uses reviewed forward repair.
DROP TRIGGER spades_card_reserved ON "CardInstance";
DROP FUNCTION spades_card_reserved();
DROP TRIGGER spades_completion_inventory ON "SpadesRoom";
DROP TABLE "TableMessage","SpadesReservation","SpadesAdmission";
DROP FUNCTION spades_reservation_consistent(),table_message_member();
DROP TRIGGER lobby_rules_guard ON "Lobby";
UPDATE "Lobby" SET "status"='OPEN' WHERE "mode"='SPADES';
DELETE FROM "LobbySeat" WHERE "lobbyId" IN (SELECT "id" FROM "Lobby" WHERE "mode"='SPADES');
ALTER TABLE "Lobby" DROP CONSTRAINT "Lobby_mode_rules_check";
UPDATE "Lobby" SET "mode"='CLASSIC',"rulesetVersion"='CLASSIC_NLHE_V1',"rulesConfig"=NULL,"status"='CLOSED' WHERE "mode"='SPADES';
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_mode_rules_check" CHECK (("mode"='CLASSIC' AND "rulesetVersion"='CLASSIC_NLHE_V1') OR ("mode"='EVOLVED' AND "rulesetVersion"='EVOLVED_A_EXPERIMENTAL_V1'));
ALTER TABLE "Lobby" DROP COLUMN "rulesConfig";
CREATE OR REPLACE FUNCTION lobby_rules_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='UPDATE' AND (NEW."mode"<>OLD."mode" OR NEW."rulesetVersion"<>OLD."rulesetVersion") THEN RAISE EXCEPTION 'immutable lobby rules'; END IF; IF NEW."mode"='EVOLVED' AND NEW."status"='STARTED' THEN RAISE EXCEPTION 'evolved balance review required'; END IF; RETURN NEW; END $$;
CREATE TRIGGER lobby_rules_guard BEFORE INSERT OR UPDATE ON "Lobby" FOR EACH ROW EXECUTE FUNCTION lobby_rules_immutable();
