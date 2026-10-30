-- Destructive rollback on the runner-owned disposable database only. Deployed repair is forward-only.
DROP TABLE "FusionIngredient","FusionJob","FusionPreview";
DROP FUNCTION fusion_consistent();
