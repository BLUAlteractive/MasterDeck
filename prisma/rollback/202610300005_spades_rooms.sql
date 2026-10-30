-- Destructive owned-test rollback only; deployed recovery preserves private evidence.
DROP TABLE "SpadesResult","SpadesEvent","SpadesSeat","SpadesRoom";
DROP FUNCTION spades_consistent(),spades_transition(),spades_immutable();
