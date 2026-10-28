BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "FaceSuit" AS ENUM ('CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CardRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "CardBranch" AS ENUM ('BLUE', 'RED');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('OWNED', 'LOCKED', 'CONSUMED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OwnershipAction" AS ENUM ('MINT', 'GRANT', 'FUSION_CONSUME', 'FUSION_CREATE', 'PRESS_EVOLVE', 'LOCK', 'UNLOCK', 'REVOKE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceDefinition" (
    "id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "suit" "FaceSuit" NOT NULL,

    CONSTRAINT "FaceDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardSeries" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "rightsOwner" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardTemplate" (
    "id" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "faceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "playStyleFamily" TEXT NOT NULL,
    "rarity" "CardRarity" NOT NULL DEFAULT 'COMMON',

    CONSTRAINT "CardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInstance" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "faceId" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'OWNED',
    "level" INTEGER NOT NULL DEFAULT 1,
    "branch" "CardBranch" NOT NULL DEFAULT 'BLUE',
    "rarity" "CardRarity" NOT NULL DEFAULT 'COMMON',
    "editionSerial" INTEGER,
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipEvent" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" "OwnershipAction" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_issuer_subject_key" ON "ExternalIdentity"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "FaceDefinition_rank_suit_key" ON "FaceDefinition"("rank", "suit");

-- CreateIndex
CREATE UNIQUE INDEX "CardSeries_slug_key" ON "CardSeries"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CardTemplate_seriesId_faceId_version_key" ON "CardTemplate"("seriesId", "faceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CardTemplate_id_seriesId_faceId_key" ON "CardTemplate"("id", "seriesId", "faceId");

-- CreateIndex
CREATE INDEX "CardInstance_ownerId_status_faceId_idx" ON "CardInstance"("ownerId", "status", "faceId");

-- CreateIndex
CREATE UNIQUE INDEX "CardInstance_seriesId_editionSerial_key" ON "CardInstance"("seriesId", "editionSerial");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipEvent_sourceKey_key" ON "OwnershipEvent"("sourceKey");

-- CreateIndex
CREATE INDEX "OwnershipEvent_instanceId_recordedAt_idx" ON "OwnershipEvent"("instanceId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationRecord_userId_operation_key_key" ON "OperationRecord"("userId", "operation", "key");

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CardSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_faceId_fkey" FOREIGN KEY ("faceId") REFERENCES "FaceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_templateId_seriesId_faceId_fkey" FOREIGN KEY ("templateId", "seriesId", "faceId") REFERENCES "CardTemplate"("id", "seriesId", "faceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipEvent" ADD CONSTRAINT "OwnershipEvent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipEvent" ADD CONSTRAINT "OwnershipEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationRecord" ADD CONSTRAINT "OperationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-authored invariants are tested against PostgreSQL, not only Prisma metadata.
ALTER TABLE "FaceDefinition" ADD CONSTRAINT "face_rank_range" CHECK ("rank" BETWEEN 2 AND 14);
ALTER TABLE "FaceDefinition" ADD CONSTRAINT "face_canonical_id" CHECK (
  "id" = (CASE "rank" WHEN 14 THEN 'A' WHEN 13 THEN 'K' WHEN 12 THEN 'Q' WHEN 11 THEN 'J' ELSE "rank"::text END)
    || '-' || (CASE "suit" WHEN 'CLUBS' THEN 'C' WHEN 'DIAMONDS' THEN 'D' WHEN 'HEARTS' THEN 'H' ELSE 'S' END)
);
ALTER TABLE "CardTemplate" ADD CONSTRAINT "template_version_positive" CHECK ("version" > 0);
ALTER TABLE "CardTemplate" ADD CONSTRAINT "style_nonempty" CHECK (length(trim("playStyleFamily")) > 0);
ALTER TABLE "CardInstance" ADD CONSTRAINT "instance_branch_level" CHECK (
  ("branch" = 'BLUE' AND "level" IN (1, 3, 5)) OR ("branch" = 'RED' AND "level" IN (2, 4, 6))
);
ALTER TABLE "CardInstance" ADD CONSTRAINT "instance_version_positive" CHECK ("stateVersion" > 0);
ALTER TABLE "CardInstance" ADD CONSTRAINT "serial_positive" CHECK ("editionSerial" IS NULL OR "editionSerial" > 0);
ALTER TABLE "OwnershipEvent" ADD CONSTRAINT "event_version_positive" CHECK ("stateVersion" > 0);
ALTER TABLE "OwnershipEvent" ADD CONSTRAINT "event_object_snapshot" CHECK (jsonb_typeof("snapshot") = 'object');
ALTER TABLE "OperationRecord" ADD CONSTRAINT "operation_key_length" CHECK (length("key") BETWEEN 10 AND 128);
ALTER TABLE "OperationRecord" ADD CONSTRAINT "operation_nonempty" CHECK (length(trim("operation")) > 0);
ALTER TABLE "OperationRecord" ADD CONSTRAINT "operation_sha256" CHECK ("requestHash" ~ '^[0-9a-f]{64}$');

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only record cannot be changed' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER ownership_append_only BEFORE UPDATE OR DELETE ON "OwnershipEvent"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER operation_append_only BEFORE UPDATE OR DELETE ON "OperationRecord"
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE FUNCTION protect_instance_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'card instances retain history' USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW."id", NEW."faceId", NEW."seriesId", NEW."templateId", NEW."createdAt")
      IS DISTINCT FROM ROW(OLD."id", OLD."faceId", OLD."seriesId", OLD."templateId", OLD."createdAt") THEN
    RAISE EXCEPTION 'card identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW IS DISTINCT FROM OLD AND NEW."stateVersion" <> OLD."stateVersion" + 1 THEN
    RAISE EXCEPTION 'card version must advance by one' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER instance_identity_guard BEFORE UPDATE OR DELETE ON "CardInstance"
  FOR EACH ROW EXECUTE FUNCTION protect_instance_identity();

COMMIT;
