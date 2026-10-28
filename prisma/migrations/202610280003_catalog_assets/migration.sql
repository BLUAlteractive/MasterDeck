BEGIN;

-- CreateEnum
CREATE TYPE "ArtAssetKind" AS ENUM ('FRONT', 'BACK');

-- CreateEnum
CREATE TYPE "AssetUseScope" AS ENUM ('INTERNAL_PREVIEW', 'COMMERCIAL');

-- AlterTable
ALTER TABLE "CardTemplate" ADD COLUMN     "backAssetId" UUID,
ADD COLUMN     "backKind" "ArtAssetKind" NOT NULL DEFAULT 'BACK',
ADD COLUMN     "frontAssetId" UUID,
ADD COLUMN     "frontKind" "ArtAssetKind" NOT NULL DEFAULT 'FRONT';

-- CreateTable
CREATE TABLE "DesignAsset" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "ArtAssetKind" NOT NULL,
    "faceId" TEXT,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "rightsBasis" TEXT NOT NULL,
    "rightsHolder" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "useScope" "AssetUseScope" NOT NULL DEFAULT 'INTERNAL_PREVIEW',
    "approvalReference" TEXT,

    CONSTRAINT "DesignAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DesignAsset_key_key" ON "DesignAsset"("key");

-- CreateIndex
CREATE UNIQUE INDEX "DesignAsset_id_faceId_kind_key" ON "DesignAsset"("id", "faceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DesignAsset_id_kind_key" ON "DesignAsset"("id", "kind");

-- AddForeignKey
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_frontAssetId_faceId_frontKind_fkey" FOREIGN KEY ("frontAssetId", "faceId", "frontKind") REFERENCES "DesignAsset"("id", "faceId", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_backAssetId_backKind_fkey" FOREIGN KEY ("backAssetId", "backKind") REFERENCES "DesignAsset"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_faceId_fkey" FOREIGN KEY ("faceId") REFERENCES "FaceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "DesignAsset" ADD CONSTRAINT "asset_kind_face" CHECK (
  ("kind" = 'FRONT' AND "faceId" IS NOT NULL) OR ("kind" = 'BACK' AND "faceId" IS NULL)
);
ALTER TABLE "DesignAsset" ADD CONSTRAINT "asset_hash" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "DesignAsset" ADD CONSTRAINT "asset_dimensions" CHECK ("width" > 0 AND "height" > 0);
ALTER TABLE "DesignAsset" ADD CONSTRAINT "asset_svg" CHECK ("mimeType" = 'image/svg+xml');
ALTER TABLE "DesignAsset" ADD CONSTRAINT "asset_provenance" CHECK (
  "rightsBasis" = 'ORIGINAL_CODE' AND length(trim("rightsHolder")) > 0 AND length(trim("sourceRef")) > 0
);
ALTER TABLE "DesignAsset" ADD CONSTRAINT "asset_commercial_evidence" CHECK (
  "useScope" <> 'COMMERCIAL' OR ("approvalReference" IS NOT NULL AND length("approvalReference") >= 8)
);
ALTER TABLE "CardTemplate" ADD CONSTRAINT "template_asset_kinds" CHECK ("frontKind" = 'FRONT' AND "backKind" = 'BACK');

CREATE FUNCTION protect_art_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'art versions are retained' USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW."id", NEW."key", NEW."kind", NEW."faceId", NEW."sha256", NEW."mimeType",
         NEW."width", NEW."height", NEW."rightsBasis", NEW."rightsHolder", NEW."sourceRef")
      IS DISTINCT FROM ROW(OLD."id", OLD."key", OLD."kind", OLD."faceId", OLD."sha256", OLD."mimeType",
         OLD."width", OLD."height", OLD."rightsBasis", OLD."rightsHolder", OLD."sourceRef") THEN
    RAISE EXCEPTION 'art identity/content/provenance is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER art_version_guard BEFORE UPDATE OR DELETE ON "DesignAsset"
  FOR EACH ROW EXECUTE FUNCTION protect_art_version();

CREATE FUNCTION protect_template_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'create a new template version instead of mutating earned identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER template_version_guard BEFORE UPDATE ON "CardTemplate"
  FOR EACH ROW EXECUTE FUNCTION protect_template_version();

ALTER TABLE "CardSeries" ADD COLUMN "manifestVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CardSeries" ADD CONSTRAINT "manifest_version_positive" CHECK ("manifestVersion" > 0);
COMMIT;
