BEGIN;
-- AlterTable
ALTER TABLE "CardSeries" ADD COLUMN     "starterEligible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CardInstance" ADD COLUMN     "starterGrantId" UUID;

-- CreateTable
CREATE TABLE "StarterGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "manifestVersion" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarterGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StarterGrant_userId_key" ON "StarterGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardInstance_starterGrantId_faceId_key" ON "CardInstance"("starterGrantId", "faceId");

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_starterGrantId_fkey" FOREIGN KEY ("starterGrantId") REFERENCES "StarterGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterGrant" ADD CONSTRAINT "StarterGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterGrant" ADD CONSTRAINT "StarterGrant_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CardSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StarterGrant" ADD CONSTRAINT "starter_result_shape" CHECK (
  "manifestVersion" > 0 AND "result" ?& ARRAY['grantId', 'seriesId', 'cards'] AND jsonb_typeof("result") = 'object' AND
  "result"->>'grantId' = "id"::text AND "result"->>'seriesId' = "seriesId"::text AND
  jsonb_typeof("result"->'cards') = 'array' AND jsonb_array_length("result"->'cards') = 52
);
CREATE TRIGGER starter_append_only BEFORE UPDATE OR DELETE ON "StarterGrant"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION protect_starter_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."starterGrantId" IS DISTINCT FROM OLD."starterGrantId" THEN
    RAISE EXCEPTION 'starter origin is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER starter_origin_guard BEFORE UPDATE ON "CardInstance"
  FOR EACH ROW EXECUTE FUNCTION protect_starter_origin();
CREATE FUNCTION validate_starter_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM "CardInstance" c JOIN "CardTemplate" t ON t."id" = c."templateId"
      WHERE c."starterGrantId" = NEW."id" AND c."ownerId" = NEW."userId" AND c."seriesId" = NEW."seriesId"
      AND t."version" = NEW."manifestVersion" AND c."level" = 1 AND c."branch" = 'BLUE'
      AND c."rarity" = 'COMMON' AND c."status" = 'OWNED' AND c."stateVersion" = 1) <> 52 OR
     (SELECT count(*) FROM "OwnershipEvent" e JOIN "CardInstance" c ON c."id" = e."instanceId"
      WHERE c."starterGrantId" = NEW."id" AND e."action" = 'GRANT' AND e."actorUserId" = NEW."userId"
      AND e."stateVersion" = 1 AND e."sourceKey" = 'starter:' || NEW."id"::text || ':' || c."faceId") <> 52 OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(NEW."result"->'cards') r
       WHERE NOT EXISTS (SELECT 1 FROM "CardInstance" c WHERE c."starterGrantId" = NEW."id"
         AND c."id"::text = r->>'instanceId' AND c."faceId" = r->>'faceId')) THEN
    RAISE EXCEPTION 'starter grant requires 52 cards and origin events in one transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER starter_complete AFTER INSERT ON "StarterGrant"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_starter_completion();
COMMIT;
