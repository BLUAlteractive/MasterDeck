-- Disposable-test reversal. Production rollback must preserve private dispute evidence.
BEGIN;
DROP TABLE "GameEvent", "GameParticipant", "GameRoom";
DROP FUNCTION game_consistent(), game_room_transition(), game_immutable();
COMMIT;
