-- Disposable owned test database only. Deployed repair preserves competition/audit history.
DROP TABLE "TournamentDispute", "TournamentAudit", "TournamentAward", "TournamentResult", "TournamentBinding", "TournamentReady", "TournamentMatch", "TournamentEntry", "Tournament";
DROP FUNCTION tournament_consistency();
DROP FUNCTION tournament_write_guard();
DROP FUNCTION tournament_dispute_guard();
