CREATE OR REPLACE FUNCTION protect_auth_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'session revocation tombstones are retained' USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW."id", NEW."identityId", NEW."providerSessionId", NEW."createdAt")
      IS DISTINCT FROM ROW(OLD."id", OLD."identityId", OLD."providerSessionId", OLD."createdAt")
      OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
    RAISE EXCEPTION 'session identity and revocation are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Owned disposable databases only. Production rollback preserves deletion evidence and tombstones.
DROP TABLE "IdentityTombstone", "PrivacyDeletionProof", "PrivacyDeletionJob", "PrivacyAccessEvent", "PrivacyConsent", "PrivacyChoice";
DROP FUNCTION privacy_choice_guard(), privacy_choice_evidence(), privacy_job_guard(), privacy_completion_guard(), privacy_proof_owner();
