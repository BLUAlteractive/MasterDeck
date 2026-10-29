BEGIN;
-- CreateTable
CREATE TABLE "Loadout" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Loadout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadoutCard" (
    "loadoutId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "loadoutVersion" INTEGER NOT NULL,
    "faceId" TEXT NOT NULL,
    "instanceId" UUID NOT NULL,

    CONSTRAINT "LoadoutCard_pkey" PRIMARY KEY ("loadoutId","faceId")
);

-- CreateTable
CREATE TABLE "CollectionManager" (
    "userId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CollectionManager_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CollectionManagerSlot" (
    "userId" UUID NOT NULL,
    "managerVersion" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "instanceId" UUID NOT NULL,

    CONSTRAINT "CollectionManagerSlot_pkey" PRIMARY KEY ("userId","slot")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loadout_userId_key" ON "Loadout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Loadout_id_userId_version_key" ON "Loadout"("id", "userId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LoadoutCard_loadoutId_instanceId_key" ON "LoadoutCard"("loadoutId", "instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionManager_userId_version_key" ON "CollectionManager"("userId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionManagerSlot_userId_instanceId_key" ON "CollectionManagerSlot"("userId", "instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "CardInstance_id_ownerId_faceId_key" ON "CardInstance"("id", "ownerId", "faceId");

-- CreateIndex
CREATE UNIQUE INDEX "CardInstance_id_ownerId_key" ON "CardInstance"("id", "ownerId");

-- AddForeignKey
ALTER TABLE "Loadout" ADD CONSTRAINT "Loadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadoutCard" ADD CONSTRAINT "LoadoutCard_loadoutId_userId_loadoutVersion_fkey" FOREIGN KEY ("loadoutId", "userId", "loadoutVersion") REFERENCES "Loadout"("id", "userId", "version") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "LoadoutCard" ADD CONSTRAINT "LoadoutCard_instanceId_userId_faceId_fkey" FOREIGN KEY ("instanceId", "userId", "faceId") REFERENCES "CardInstance"("id", "ownerId", "faceId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectionManager" ADD CONSTRAINT "CollectionManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionManagerSlot" ADD CONSTRAINT "CollectionManagerSlot_userId_managerVersion_fkey" FOREIGN KEY ("userId", "managerVersion") REFERENCES "CollectionManager"("userId", "version") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "CollectionManagerSlot" ADD CONSTRAINT "CollectionManagerSlot_instanceId_userId_fkey" FOREIGN KEY ("instanceId", "userId") REFERENCES "CardInstance"("id", "ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "Loadout" ADD CONSTRAINT loadout_version_positive CHECK ("version">0);
ALTER TABLE "CollectionManager" ADD CONSTRAINT manager_version_positive CHECK ("version">0);
ALTER TABLE "CollectionManagerSlot" ADD CONSTRAINT manager_slot_range CHECK ("slot" BETWEEN 1 AND 100);
CREATE FUNCTION guard_selection_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."userId"<>OLD."userId" OR NEW."version"<>OLD."version"+1 THEN
  RAISE EXCEPTION 'selection version must advance once for same owner' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='Loadout' AND to_jsonb(NEW)->>'id'<>to_jsonb(OLD)->>'id' THEN
  RAISE EXCEPTION 'loadout identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER loadout_version_guard BEFORE UPDATE ON "Loadout" FOR EACH ROW EXECUTE FUNCTION guard_selection_version();
CREATE TRIGGER manager_version_guard BEFORE UPDATE ON "CollectionManager" FOR EACH ROW EXECUTE FUNCTION guard_selection_version();
CREATE FUNCTION require_complete_loadout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
 IF TG_TABLE_NAME='Loadout' THEN target=NEW."id";
 ELSIF TG_OP='DELETE' THEN target=OLD."loadoutId";
 ELSE target=NEW."loadoutId"; END IF;
 IF EXISTS (SELECT 1 FROM "Loadout" WHERE "id"=target) AND
    (SELECT count(*) FROM "LoadoutCard" WHERE "loadoutId"=target)<>52 THEN
  RAISE EXCEPTION 'loadout requires exactly 52 face references' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='LoadoutCard' AND TG_OP='UPDATE' THEN
  IF OLD."loadoutId"<>NEW."loadoutId" AND EXISTS(SELECT 1 FROM "Loadout" WHERE "id"=OLD."loadoutId") AND
     (SELECT count(*) FROM "LoadoutCard" WHERE "loadoutId"=OLD."loadoutId")<>52 THEN
   RAISE EXCEPTION 'old loadout also requires 52 faces' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER loadout_complete AFTER INSERT OR UPDATE ON "Loadout"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_complete_loadout();
CREATE CONSTRAINT TRIGGER loadout_cards_complete AFTER INSERT OR UPDATE OR DELETE ON "LoadoutCard"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_complete_loadout();
COMMIT;
