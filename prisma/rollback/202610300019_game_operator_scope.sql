-- Owned disposable test DB only. Production access repair retains operator/audit records.
DROP TRIGGER tournament_operator_guard ON "TournamentAudit";
DROP FUNCTION tournament_operator_guard();
ALTER TABLE "AdminCapability" DROP CONSTRAINT admin_capability_scopes;
ALTER TABLE "AdminCapability" DISABLE TRIGGER admin_capability_guard;
DELETE FROM "AdminCapability" WHERE capability='GAME_OPERATOR';
ALTER TABLE "AdminCapability" ENABLE TRIGGER admin_capability_guard;
ALTER TABLE "AdminCapability" ADD CHECK (capability IN ('CONTENT_EDITOR','CONTENT_REVIEWER','CONTENT_PUBLISHER','PRODUCT_OPERATOR','SUPPORT','AUDITOR','PRIVACY_OPERATOR','RELEASE_OPERATOR') AND length("grantedBy")>=8);
