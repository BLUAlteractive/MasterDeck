-- Owned disposable test database only; deployed recovery preserves grants and source evidence.
DROP TABLE "ProgressConsumption","ProgressCounter","ProgressAward","ProgressEvent","ProgressGoal","ProgressSource";
DROP FUNCTION progress_consistent(),progress_event_source();
DROP FUNCTION progress_counter_transition();
