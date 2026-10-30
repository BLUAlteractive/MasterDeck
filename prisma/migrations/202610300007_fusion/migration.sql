-- CreateTable
CREATE TABLE "FusionPreview" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FusionPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FusionJob" (
    "id" UUID NOT NULL,
    "previewId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "receipt" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FusionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FusionIngredient" (
    "parentId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "expectedVersion" INTEGER NOT NULL,

    CONSTRAINT "FusionIngredient_pkey" PRIMARY KEY ("parentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FusionPreview_childId_key" ON "FusionPreview"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "FusionJob_previewId_key" ON "FusionJob"("previewId");

-- CreateIndex
CREATE UNIQUE INDEX "FusionJob_childId_key" ON "FusionJob"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "FusionJob_childId_ownerId_key" ON "FusionJob"("childId", "ownerId");

-- CreateIndex
CREATE INDEX "FusionIngredient_jobId_idx" ON "FusionIngredient"("jobId");

-- AddForeignKey
ALTER TABLE "FusionPreview" ADD CONSTRAINT "FusionPreview_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionJob" ADD CONSTRAINT "FusionJob_previewId_fkey" FOREIGN KEY ("previewId") REFERENCES "FusionPreview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionJob" ADD CONSTRAINT "FusionJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionJob" ADD CONSTRAINT "FusionJob_childId_ownerId_fkey" FOREIGN KEY ("childId", "ownerId") REFERENCES "CardInstance"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionIngredient" ADD CONSTRAINT "FusionIngredient_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionIngredient" ADD CONSTRAINT "FusionIngredient_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FusionJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TRIGGER fusion_preview_immutable BEFORE UPDATE OR DELETE ON "FusionPreview" FOR EACH ROW EXECUTE FUNCTION spades_immutable();
CREATE TRIGGER fusion_job_immutable BEFORE UPDATE OR DELETE ON "FusionJob" FOR EACH ROW EXECUTE FUNCTION spades_immutable();
CREATE TRIGGER fusion_ingredient_immutable BEFORE UPDATE OR DELETE ON "FusionIngredient" FOR EACH ROW EXECUTE FUNCTION spades_immutable();
ALTER TABLE "FusionIngredient" ADD CHECK ("expectedVersion">0);
CREATE FUNCTION fusion_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "FusionJob"; c "CardInstance"; p "FusionPreview"; n integer;
BEGIN
 IF TG_TABLE_NAME='FusionJob' THEN SELECT * INTO j FROM "FusionJob" WHERE "id"=NEW."id";
 ELSE SELECT * INTO j FROM "FusionJob" WHERE "id"=NEW."jobId"; END IF;
 SELECT * INTO c FROM "CardInstance" WHERE "id"=j."childId";
 SELECT * INTO p FROM "FusionPreview" WHERE "id"=j."previewId";
 IF p."ownerId"<>j."ownerId" OR p."childId"<>j."childId" OR p."fingerprint"<>j."receipt"->>'previewHash'
    OR (p."snapshot"->'child') IS DISTINCT FROM (j."receipt"->'child')
    OR (p."snapshot"->'effects') IS DISTINCT FROM (j."receipt"->'effects')
    OR c."status"<>'OWNED' OR c."stateVersion"<>1 OR c."editionSerial" IS NOT NULL
    OR c."level" NOT IN (3,4,5,6) THEN RAISE EXCEPTION 'invalid fusion child or preview'; END IF;
 SELECT count(*) INTO n FROM "FusionIngredient" i JOIN "CardInstance" s ON s."id"=i."parentId"
 WHERE i."jobId"=j."id" AND s."ownerId"=j."ownerId" AND s."status"='CONSUMED'
 AND s."stateVersion"=i."expectedVersion"+1 AND s."level"+2=c."level"
 AND s."branch"=c."branch" AND s."faceId"=c."faceId" AND s."seriesId"=c."seriesId"
 AND s."templateId"=c."templateId" AND s."rarity"=c."rarity" AND s."editionSerial" IS NULL
 AND EXISTS (SELECT 1 FROM jsonb_array_elements(p."snapshot"->'sources') a WHERE a->>'id'=s."id"::text AND (a->>'stateVersion')::integer=i."expectedVersion")
 AND EXISTS (SELECT 1 FROM "OwnershipEvent" e WHERE e."instanceId"=s."id" AND e."stateVersion"=s."stateVersion"
 AND e."action"='FUSION_CONSUME' AND e."sourceKey"='fusion:'||j."id"::text||':consume:'||s."id"::text);
 IF n<>5 OR (SELECT count(*) FROM "FusionIngredient" WHERE "jobId"=j."id")<>5
 OR NOT EXISTS (SELECT 1 FROM "OwnershipEvent" e WHERE e."id"=c."originEventId" AND e."action"='FUSION_CREATE' AND e."sourceKey"='fusion:'||j."id"::text||':child')
 OR c."id"::text<>p."snapshot"->'child'->>'id'
 OR c."templateId"::text<>p."snapshot"->'child'->>'templateId'
 OR c."level"<>(p."snapshot"->'child'->>'level')::integer THEN RAISE EXCEPTION 'incomplete fusion provenance'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER fusion_job_consistent AFTER INSERT ON "FusionJob" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fusion_consistent();
CREATE CONSTRAINT TRIGGER fusion_ingredients_consistent AFTER INSERT ON "FusionIngredient" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fusion_consistent();
