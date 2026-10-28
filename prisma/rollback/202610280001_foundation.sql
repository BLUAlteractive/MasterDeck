-- DESTRUCTIVE: test-only reversal of the first migration. Never a production reset.
-- Execute only in the disposable database owned by scripts/ci-database.mjs.
BEGIN;
DROP TABLE "OperationRecord";
DROP TABLE "OwnershipEvent";
DROP TABLE "CardInstance";
DROP TABLE "CardTemplate";
DROP TABLE "CardSeries";
DROP TABLE "FaceDefinition";
DROP TABLE "ExternalIdentity";
DROP TABLE "User";
DROP FUNCTION protect_instance_identity();
DROP FUNCTION reject_history_mutation();
DROP TYPE "OwnershipAction";
DROP TYPE "CardStatus";
DROP TYPE "CardBranch";
DROP TYPE "CardRarity";
DROP TYPE "CatalogStatus";
DROP TYPE "FaceSuit";
DROP TYPE "UserStatus";
COMMIT;
