-- Destructive disposable-test reversal only.
BEGIN;
DROP TRIGGER template_version_guard ON "CardTemplate";
DROP FUNCTION protect_template_version();
ALTER TABLE "CardTemplate" DROP CONSTRAINT "CardTemplate_frontAssetId_faceId_frontKind_fkey";
ALTER TABLE "CardTemplate" DROP CONSTRAINT "CardTemplate_backAssetId_backKind_fkey";
ALTER TABLE "CardTemplate" DROP COLUMN "frontAssetId", DROP COLUMN "frontKind", DROP COLUMN "backAssetId", DROP COLUMN "backKind";
DROP TABLE "DesignAsset";
DROP FUNCTION protect_art_version();
ALTER TABLE "CardSeries" DROP COLUMN "manifestVersion";
DROP TYPE "AssetUseScope";
DROP TYPE "ArtAssetKind";
COMMIT;
