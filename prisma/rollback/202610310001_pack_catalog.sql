-- Disposable owned database only; production preserves published definitions/reviews.
DROP TABLE "PackReview","PackDefinition";
DROP FUNCTION pack_definition_guard(),pack_review_guard(),pack_change_audit();
