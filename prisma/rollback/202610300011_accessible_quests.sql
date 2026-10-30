DROP TRIGGER accessible_ledger_proof ON "RestrictedTransfer";
DROP TABLE "AccessibleQuestFact","AccessibleQuestCompletion","AccessibleQuestEnrollment";
DROP FUNCTION accessible_enrollment_guard(),accessible_complete_consistent();
