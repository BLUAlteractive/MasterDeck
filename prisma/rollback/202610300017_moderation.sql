-- Owned disposable DB only; production repair retains cases, blocks and access audits.
DROP TABLE "GameReport", "UserBlockEvent", "UserBlock";
DROP FUNCTION report_member_guard();
DROP FUNCTION block_reconcile();
DROP FUNCTION block_guard();
