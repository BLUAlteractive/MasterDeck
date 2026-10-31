-- Owned disposable database only. Review production aggregate retention separately.
DROP TABLE "CollectorActivity";
DROP FUNCTION collector_activity_guard();
