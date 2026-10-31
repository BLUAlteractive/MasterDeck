-- Owned disposable DB only. Preserve deployed access/audit/review history with forward repair.
DROP TABLE "ProductAvailability", "ContentReview", "AdminAction", "AdminCapability";
DROP FUNCTION product_availability_guard();
DROP FUNCTION admin_capability_guard();
