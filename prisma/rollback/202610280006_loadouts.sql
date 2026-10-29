-- Destructive disposable-test reversal only. Inventory/history are never deleted here.
BEGIN;
DROP TABLE "LoadoutCard";
DROP TABLE "CollectionManagerSlot";
DROP TABLE "Loadout";
DROP TABLE "CollectionManager";
DROP FUNCTION require_complete_loadout();
DROP FUNCTION guard_selection_version();
DROP INDEX "CardInstance_id_ownerId_faceId_key";
DROP INDEX "CardInstance_id_ownerId_key";
COMMIT;
