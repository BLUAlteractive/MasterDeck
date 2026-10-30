-- Owned disposable test database only; preserve populated lobbies in deployed recovery.
BEGIN;
DROP TABLE "LobbySeat","Lobby";
DROP FUNCTION lobby_capacity();
COMMIT;
