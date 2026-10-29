BEGIN;
-- AlterTable
ALTER TABLE "CardInstance" ADD COLUMN     "lockReason" TEXT,
ADD COLUMN     "lockToken" UUID,
ADD COLUMN     "originEventId" UUID;

-- AlterTable
ALTER TABLE "OwnershipEvent" ADD COLUMN     "operatorId" TEXT;

-- CreateIndex
CREATE INDEX "OwnershipEvent_instanceId_stateVersion_id_idx" ON "OwnershipEvent"("instanceId", "stateVersion", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipEvent_id_instanceId_key" ON "OwnershipEvent"("id", "instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipEvent_instanceId_stateVersion_key" ON "OwnershipEvent"("instanceId", "stateVersion");

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_originEventId_id_fkey" FOREIGN KEY ("originEventId", "id") REFERENCES "OwnershipEvent"("id", "instanceId") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- Link only existing recorded origins. Unknown legacy origins remain NULL, never fabricated.
ALTER TABLE "CardInstance" DISABLE TRIGGER instance_identity_guard;
UPDATE "CardInstance" c SET "originEventId" = e."id" FROM "OwnershipEvent" e
 WHERE e."instanceId" = c."id" AND e."stateVersion" = 1 AND e."action" IN ('MINT','GRANT','FUSION_CREATE');
ALTER TABLE "CardInstance" ENABLE TRIGGER instance_identity_guard;
ALTER TABLE "CardInstance" ADD CONSTRAINT card_lock_shape CHECK (
 ("status" = 'LOCKED' AND "lockToken" IS NOT NULL AND "lockReason" IS NOT NULL AND "lockReason" ~ '^[A-Z0-9_]{3,64}$') OR
 ("status" <> 'LOCKED' AND "lockToken" IS NULL AND "lockReason" IS NULL)
);
CREATE FUNCTION guard_card_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
 IF ROW(NEW."originEventId",NEW."ownerId",NEW."editionSerial",NEW."level",NEW."branch",NEW."rarity")
   IS DISTINCT FROM ROW(OLD."originEventId",OLD."ownerId",OLD."editionSerial",OLD."level",OLD."branch",OLD."rarity") THEN
  RAISE EXCEPTION 'origin, owner and earned identity require their owning feature migration' USING ERRCODE='23514';
 END IF;
 IF NOT ((OLD."status"='OWNED' AND NEW."status" IN ('LOCKED','CONSUMED','REVOKED')) OR
         (OLD."status"='LOCKED' AND NEW."status" IN ('OWNED','REVOKED'))) THEN
  RAISE EXCEPTION 'invalid lifecycle transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER card_lifecycle_guard BEFORE UPDATE ON "CardInstance" FOR EACH ROW EXECUTE FUNCTION guard_card_lifecycle();
CREATE FUNCTION validate_new_ownership_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "CardInstance";
BEGIN
 SELECT * INTO c FROM "CardInstance" WHERE "id"=NEW."instanceId";
 IF NOT FOUND THEN RETURN NEW; END IF; -- FK supplies the canonical orphan error.
 IF NEW."operatorId" IS NULL OR NEW."operatorId" !~ '^[a-z][a-z0-9.-]{2,63}$' OR length(trim(NEW."reason"))=0 OR
    NEW."stateVersion"<>c."stateVersion" OR
    NOT (NEW."snapshot" @> jsonb_build_object('instanceId',c."id",'ownerId',c."ownerId",'status',c."status",
      'stateVersion',c."stateVersion",'level',c."level",'branch',c."branch",'rarity',c."rarity",
      'lockToken',c."lockToken",'lockReason',c."lockReason")) THEN
  RAISE EXCEPTION 'ownership event must identify operator and exact current state' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER ownership_event_guard BEFORE INSERT ON "OwnershipEvent" FOR EACH ROW EXECUTE FUNCTION validate_new_ownership_event();
CREATE FUNCTION require_card_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "OwnershipEvent";
BEGIN
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
 SELECT * INTO e FROM "OwnershipEvent" WHERE "instanceId"=NEW."id" AND "stateVersion"=NEW."stateVersion";
 IF NOT FOUND OR NOT (e."snapshot" @> jsonb_build_object('instanceId',NEW."id",'ownerId',NEW."ownerId",'status',NEW."status",
      'stateVersion',NEW."stateVersion",'level',NEW."level",'branch',NEW."branch",'rarity',NEW."rarity",
      'lockToken',NEW."lockToken",'lockReason',NEW."lockReason")) THEN
  RAISE EXCEPTION 'state and history must commit together' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."stateVersion"<>1 OR NEW."status"<>'OWNED' OR NEW."originEventId" IS NULL OR e."id"<>NEW."originEventId" OR e."action" NOT IN ('MINT','GRANT','FUSION_CREATE') THEN
   RAISE EXCEPTION 'new card requires recorded origin' USING ERRCODE='23514';
  END IF;
 ELSIF NOT ((NEW."status"='LOCKED' AND e."action"='LOCK') OR
            (NEW."status"='OWNED' AND e."action"='UNLOCK') OR
            (NEW."status"='CONSUMED' AND e."action"='FUSION_CONSUME') OR
            (NEW."status"='REVOKED' AND e."action"='REVOKE')) THEN
  RAISE EXCEPTION 'transition and history action mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER card_history_required AFTER INSERT OR UPDATE ON "CardInstance"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_card_history();
COMMIT;
