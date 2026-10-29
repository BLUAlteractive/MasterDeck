-- Destructive disposable-test reversal only; not a deployed-data recovery command.
BEGIN;
DROP TRIGGER starter_complete ON "StarterGrant";
DROP FUNCTION validate_starter_completion();
DROP TRIGGER starter_origin_guard ON "CardInstance";
DROP FUNCTION protect_starter_origin();
ALTER TABLE "CardInstance" DROP COLUMN "starterGrantId";
DROP TABLE "StarterGrant";
ALTER TABLE "CardSeries" DROP COLUMN "starterEligible";
COMMIT;
