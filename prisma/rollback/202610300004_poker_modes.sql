-- Owned disposable databases only. Deployed recovery preserves evidence and uses forward repair.
DROP TRIGGER lobby_rules_guard ON "Lobby";
DROP FUNCTION lobby_rules_immutable();
DROP INDEX "Lobby_queue_rules_idx";
DELETE FROM "LobbySeat" WHERE "lobbyId" IN (SELECT "id" FROM "Lobby" WHERE "mode"='EVOLVED');
ALTER TABLE "Lobby" DROP CONSTRAINT "Lobby_mode_rules_check";
UPDATE "Lobby" SET "mode"='CLASSIC',"status"='CLOSED' WHERE "mode"='EVOLVED';
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_mode_check" CHECK ("mode"='CLASSIC');
ALTER TABLE "Lobby" DROP COLUMN "rulesetVersion";
