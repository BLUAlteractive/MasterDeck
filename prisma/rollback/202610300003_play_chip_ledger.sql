-- Destructive owned-test reversal only. Preserve immutable financial/game evidence in production.
BEGIN;
DROP TRIGGER lobby_started_seats ON "LobbySeat";
DROP FUNCTION lobby_started_seats();
ALTER TABLE "Lobby" DROP CONSTRAINT "Lobby_status_check";
UPDATE "Lobby" SET "status"='CLOSED' WHERE "status"='STARTED';
ALTER TABLE "Lobby" ADD CHECK("status" IN ('OPEN','CLOSED'));
DROP TABLE "GameResult","GameReservation","GameAdmission","PlayChipEntry","PlayChipTransfer","PlayChipAccount";
DROP FUNCTION game_admission_consistent(),game_result_consistent(),chip_transfer_balanced(),chip_account_balanced(),chip_account_identity();
COMMIT;
