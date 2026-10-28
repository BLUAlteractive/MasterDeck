-- Disposable test reversal only; never a populated production rollback.
BEGIN;
DROP TABLE "DeletionRequest";
DROP TABLE "AuthAudit";
DROP TABLE "AuthSession";
DROP FUNCTION protect_auth_session();
ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "UserRole";
COMMIT;
