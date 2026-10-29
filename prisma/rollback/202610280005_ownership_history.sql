-- Destructive disposable-test reversal only.
BEGIN;
DROP TRIGGER card_history_required ON "CardInstance";
DROP FUNCTION require_card_history();
DROP TRIGGER ownership_event_guard ON "OwnershipEvent";
DROP FUNCTION validate_new_ownership_event();
DROP TRIGGER card_lifecycle_guard ON "CardInstance";
DROP FUNCTION guard_card_lifecycle();
ALTER TABLE "CardInstance" DROP CONSTRAINT card_lock_shape;
ALTER TABLE "CardInstance" DROP COLUMN "originEventId", DROP COLUMN "lockToken", DROP COLUMN "lockReason";
DROP INDEX "OwnershipEvent_instanceId_stateVersion_key";
DROP INDEX "OwnershipEvent_id_instanceId_key";
DROP INDEX "OwnershipEvent_instanceId_stateVersion_id_idx";
ALTER TABLE "OwnershipEvent" DROP COLUMN "operatorId";
COMMIT;
