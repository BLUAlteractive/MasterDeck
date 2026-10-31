-- Owned disposable databases only; production rollback disables ingestion and preserves evidence.
DROP TABLE "ActivityAllocation", "ActivityReview", "ActivityDay", "ActivitySource", "ActivityBatch";
DROP FUNCTION activity_source_guard(),activity_day_guard(),activity_day_consistent(),activity_allocation_guard(),activity_review_owner(), activity_source_owner();
