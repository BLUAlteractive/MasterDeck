-- Disposable database only; production retires patterns and retains snapshots.
DROP TABLE "ScreenReview","ScreenPattern";
DROP FUNCTION screen_pattern_definition_guard(),screen_pattern_review_guard(),screen_pattern_change_audit();
