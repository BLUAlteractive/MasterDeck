-- CreateTable
CREATE TABLE "Tournament" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "title" TEXT NOT NULL,
    "policy" JSONB NOT NULL,
    "admissionPolicy" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTRATION',
    "championEntryId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntry" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seed" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "leftEntryId" UUID,
    "rightEntryId" UUID,
    "winnerEntryId" UUID,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "attempt" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentReady" (
    "matchId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentReady_pkey" PRIMARY KEY ("matchId","attempt","userId")
);

-- CreateTable
CREATE TABLE "TournamentBinding" (
    "lobbyId" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "roomId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentBinding_pkey" PRIMARY KEY ("lobbyId")
);

-- CreateTable
CREATE TABLE "TournamentResult" (
    "roomId" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "winnerEntryId" UUID,
    "allocationHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentResult_pkey" PRIMARY KEY ("roomId")
);

-- CreateTable
CREATE TABLE "TournamentAward" (
    "tournamentId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentAward_pkey" PRIMARY KEY ("tournamentId")
);

-- CreateTable
CREATE TABLE "TournamentAudit" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentDispute" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tournament_status_startsAt_idx" ON "Tournament"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntry_tournamentId_userId_key" ON "TournamentEntry"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntry_tournamentId_seed_key" ON "TournamentEntry"("tournamentId", "seed");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMatch_tournamentId_round_slot_key" ON "TournamentMatch"("tournamentId", "round", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentBinding_roomId_key" ON "TournamentBinding"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentBinding_matchId_attempt_key" ON "TournamentBinding"("matchId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentResult_matchId_attempt_key" ON "TournamentResult"("matchId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentAudit_actorId_commandId_key" ON "TournamentAudit"("actorId", "commandId");

-- CreateIndex
CREATE INDEX "TournamentDispute_tournamentId_createdAt_idx" ON "TournamentDispute"("tournamentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentDispute_userId_commandId_key" ON "TournamentDispute"("userId", "commandId");

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentReady" ADD CONSTRAINT "TournamentReady_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentBinding" ADD CONSTRAINT "TournamentBinding_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentResult" ADD CONSTRAINT "TournamentResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentAward" ADD CONSTRAINT "TournamentAward_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fixed reviewed format; no entry fee, monetary prize or client-supplied winner.
ALTER TABLE "Tournament" ADD CHECK ("capacity" IN (2,4,8,16,32) AND "status" IN ('REGISTRATION','RUNNING','COMPLETED','CANCELLED') AND "policy"->>'format'='CLASSIC_HEADS_UP_SINGLE_HAND_V1' AND "policy"->>'prize'='PRESTIGE_TITLE');
ALTER TABLE "TournamentEntry" ADD CHECK ("seed">0);
ALTER TABLE "TournamentMatch" ADD CHECK ("round">=0 AND "slot">=0 AND "attempt">0 AND "status" IN ('WAITING','PLAYING','COMPLETE') AND ("leftEntryId" IS NULL OR "rightEntryId" IS NULL OR "leftEntryId"<>"rightEntryId"));
ALTER TABLE "TournamentBinding" ADD FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE RESTRICT;
ALTER TABLE "TournamentBinding" ADD FOREIGN KEY ("roomId") REFERENCES "GameRoom"("id") ON DELETE RESTRICT;
ALTER TABLE "TournamentResult" ADD FOREIGN KEY ("roomId") REFERENCES "GameResult"("roomId") ON DELETE RESTRICT;
ALTER TABLE "TournamentAudit" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "TournamentAudit" ADD FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT;
CREATE TRIGGER tournament_entry_immutable BEFORE UPDATE OR DELETE ON "TournamentEntry" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER tournament_ready_immutable BEFORE UPDATE OR DELETE ON "TournamentReady" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER tournament_result_immutable BEFORE UPDATE OR DELETE ON "TournamentResult" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER tournament_award_immutable BEFORE UPDATE OR DELETE ON "TournamentAward" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER tournament_audit_immutable BEFORE UPDATE OR DELETE ON "TournamentAudit" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION tournament_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "Tournament"; m "TournamentMatch";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'TOURNAMENT_HISTORY_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='Tournament' THEN
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['status','championEntryId','completedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','championEntryId','completedAt']) OR NOT ((OLD.status='REGISTRATION' AND NEW.status IN ('RUNNING','CANCELLED')) OR (OLD.status='RUNNING' AND NEW.status='COMPLETED'))) THEN RAISE EXCEPTION 'TOURNAMENT_TRANSITION'; END IF;
 ELSIF TG_TABLE_NAME='TournamentEntry' THEN
  SELECT * INTO t FROM "Tournament" WHERE id=NEW."tournamentId" FOR UPDATE;
  IF t.status<>'REGISTRATION' OR clock_timestamp()>=t."startsAt" OR NEW.seed>t.capacity OR NEW.seed<>(SELECT count(*)+1 FROM "TournamentEntry" WHERE "tournamentId"=t.id) OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."userId" AND status='ACTIVE' AND NOT "isGuest") THEN RAISE EXCEPTION 'TOURNAMENT_ENTRY'; END IF;
 ELSIF TG_TABLE_NAME='TournamentMatch' THEN
  IF TG_OP='UPDATE' AND ((NEW.id,NEW."tournamentId",NEW.round,NEW.slot) IS DISTINCT FROM (OLD.id,OLD."tournamentId",OLD.round,OLD.slot) OR (OLD."leftEntryId" IS NOT NULL AND NEW."leftEntryId" IS DISTINCT FROM OLD."leftEntryId") OR (OLD."rightEntryId" IS NOT NULL AND NEW."rightEntryId" IS DISTINCT FROM OLD."rightEntryId") OR OLD.status='COMPLETE' OR NOT ((NEW.attempt=OLD.attempt AND NEW.status IN (OLD.status,'PLAYING','COMPLETE')) OR (OLD.status='PLAYING' AND NEW.status='WAITING' AND NEW.attempt=OLD.attempt+1 AND EXISTS(SELECT 1 FROM "TournamentResult" WHERE "matchId"=OLD.id AND attempt=OLD.attempt AND "winnerEntryId" IS NULL)))) THEN RAISE EXCEPTION 'TOURNAMENT_MATCH_TRANSITION'; END IF;
 ELSIF TG_TABLE_NAME='TournamentReady' THEN
  SELECT * INTO m FROM "TournamentMatch" WHERE id=NEW."matchId";
  IF m.status<>'WAITING' OR m.attempt<>NEW.attempt OR NOT EXISTS(SELECT 1 FROM "TournamentEntry" WHERE id IN (m."leftEntryId",m."rightEntryId") AND "userId"=NEW."userId") THEN RAISE EXCEPTION 'TOURNAMENT_CONSENT'; END IF;
 ELSIF TG_TABLE_NAME='TournamentBinding' THEN
  SELECT * INTO m FROM "TournamentMatch" WHERE id=NEW."matchId";
  IF TG_OP='INSERT' AND (NEW."roomId" IS NOT NULL OR m.status<>'WAITING' OR m.attempt<>NEW.attempt OR (SELECT count(*) FROM "TournamentReady" WHERE "matchId"=m.id AND attempt=m.attempt)<>2) THEN RAISE EXCEPTION 'TOURNAMENT_PREDEAL_BINDING'; END IF;
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'roomId') IS DISTINCT FROM (to_jsonb(OLD)-'roomId') OR OLD."roomId" IS NOT NULL OR NEW."roomId" IS NULL) THEN RAISE EXCEPTION 'TOURNAMENT_BINDING_IMMUTABLE'; END IF;
 ELSIF TG_TABLE_NAME='TournamentAudit' THEN
  IF length(NEW.reason)<5 OR NEW.action NOT IN ('CREATE','REPLAY') OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."actorId" AND role='ADMIN' AND status='ACTIVE' AND NOT "isGuest") THEN RAISE EXCEPTION 'TOURNAMENT_ADMIN_AUDIT'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tournament_write BEFORE INSERT OR UPDATE OR DELETE ON "Tournament" FOR EACH ROW EXECUTE FUNCTION tournament_write_guard();
CREATE TRIGGER tournament_entry_write BEFORE INSERT ON "TournamentEntry" FOR EACH ROW EXECUTE FUNCTION tournament_write_guard();
CREATE TRIGGER tournament_match_write BEFORE INSERT OR UPDATE OR DELETE ON "TournamentMatch" FOR EACH ROW EXECUTE FUNCTION tournament_write_guard();
CREATE TRIGGER tournament_ready_write BEFORE INSERT ON "TournamentReady" FOR EACH ROW EXECUTE FUNCTION tournament_write_guard();
CREATE TRIGGER tournament_binding_write BEFORE INSERT OR UPDATE OR DELETE ON "TournamentBinding" FOR EACH ROW EXECUTE FUNCTION tournament_write_guard();
CREATE TRIGGER tournament_audit_write BEFORE INSERT ON "TournamentAudit" FOR EACH ROW EXECUTE FUNCTION tournament_write_guard();
CREATE FUNCTION tournament_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; t "Tournament"; m "TournamentMatch"; b "TournamentBinding"; r "TournamentResult"; expected uuid; a bigint; c bigint;
BEGIN
 IF TG_TABLE_NAME='Tournament' THEN tid=NEW.id;
 ELSIF TG_TABLE_NAME IN ('TournamentMatch','TournamentAward') THEN tid=NEW."tournamentId";
 ELSE SELECT "tournamentId" INTO tid FROM "TournamentMatch" WHERE id=NEW."matchId"; END IF;
 SELECT * INTO t FROM "Tournament" WHERE id=tid;
 IF t.status IN ('RUNNING','COMPLETED') AND ((SELECT count(*) FROM "TournamentEntry" WHERE "tournamentId"=tid)<>t.capacity OR (SELECT count(*) FROM "TournamentMatch" WHERE "tournamentId"=tid)<>t.capacity-1) THEN RAISE EXCEPTION 'TOURNAMENT_FIELD_RECONCILIATION'; END IF;
 FOR m IN SELECT * FROM "TournamentMatch" WHERE "tournamentId"=tid LOOP
  IF m.round>=log(2,t.capacity) OR m.slot>=t.capacity/power(2,m.round+1) OR EXISTS(SELECT 1 FROM unnest(ARRAY[m."leftEntryId",m."rightEntryId",m."winnerEntryId"]) e WHERE e IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "TournamentEntry" WHERE id=e AND "tournamentId"=tid)) THEN RAISE EXCEPTION 'TOURNAMENT_MEMBERSHIP'; END IF;
  IF m.round>0 AND (m."leftEntryId" IS DISTINCT FROM (SELECT "winnerEntryId" FROM "TournamentMatch" WHERE "tournamentId"=tid AND round=m.round-1 AND slot=m.slot*2) OR m."rightEntryId" IS DISTINCT FROM (SELECT "winnerEntryId" FROM "TournamentMatch" WHERE "tournamentId"=tid AND round=m.round-1 AND slot=m.slot*2+1)) THEN RAISE EXCEPTION 'TOURNAMENT_ADVANCEMENT'; END IF;
  FOR b IN SELECT * FROM "TournamentBinding" WHERE "matchId"=m.id AND "roomId" IS NOT NULL LOOP
   IF NOT EXISTS(SELECT 1 FROM "GameAdmission" WHERE "roomId"=b."roomId" AND "lobbyId"=b."lobbyId" AND "policySnapshot"=t."admissionPolicy") OR (SELECT count(*) FROM "GameParticipant" WHERE "roomId"=b."roomId")<>2 OR EXISTS(SELECT 1 FROM "GameParticipant" p WHERE p."roomId"=b."roomId" AND NOT EXISTS(SELECT 1 FROM "TournamentEntry" WHERE id IN(m."leftEntryId",m."rightEntryId") AND "userId"=p."userId")) THEN RAISE EXCEPTION 'TOURNAMENT_GAME_BINDING'; END IF;
  END LOOP;
  FOR r IN SELECT * FROM "TournamentResult" WHERE "matchId"=m.id LOOP
   IF NOT EXISTS(SELECT 1 FROM "TournamentBinding" WHERE "roomId"=r."roomId" AND "matchId"=m.id AND attempt=r.attempt) THEN RAISE EXCEPTION 'TOURNAMENT_RESULT_SOURCE'; END IF;
   SELECT (p->>'finalStack')::bigint INTO a FROM "GameResult" g, jsonb_array_elements(g.allocation->'players') p JOIN "TournamentEntry" e ON e."userId"=(p->>'playerId')::uuid WHERE g."roomId"=r."roomId" AND e.id=m."leftEntryId";
   SELECT (p->>'finalStack')::bigint INTO c FROM "GameResult" g, jsonb_array_elements(g.allocation->'players') p JOIN "TournamentEntry" e ON e."userId"=(p->>'playerId')::uuid WHERE g."roomId"=r."roomId" AND e.id=m."rightEntryId";
   expected=CASE WHEN a=c THEN NULL WHEN a>c THEN m."leftEntryId" ELSE m."rightEntryId" END;
   IF a IS NULL OR c IS NULL OR r."winnerEntryId" IS DISTINCT FROM expected THEN RAISE EXCEPTION 'TOURNAMENT_RESULT_WINNER'; END IF;
  END LOOP;
  IF m.status='COMPLETE' AND NOT EXISTS(SELECT 1 FROM "TournamentResult" WHERE "matchId"=m.id AND attempt=m.attempt AND "winnerEntryId"=m."winnerEntryId" AND "winnerEntryId" IS NOT NULL) THEN RAISE EXCEPTION 'TOURNAMENT_MATCH_RESULT'; END IF;
 END LOOP;
 IF t.status='COMPLETED' THEN
  IF t."championEntryId" IS DISTINCT FROM (SELECT "winnerEntryId" FROM "TournamentMatch" WHERE "tournamentId"=tid ORDER BY round DESC LIMIT 1) OR t."championEntryId" IS NULL OR NOT EXISTS(SELECT 1 FROM "TournamentAward" WHERE "tournamentId"=tid AND "entryId"=t."championEntryId" AND title=t.title) THEN RAISE EXCEPTION 'TOURNAMENT_AWARD_RECONCILIATION'; END IF;
 ELSIF EXISTS(SELECT 1 FROM "TournamentAward" WHERE "tournamentId"=tid) THEN RAISE EXCEPTION 'TOURNAMENT_PREMATURE_AWARD'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tournament_check AFTER INSERT OR UPDATE ON "Tournament" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tournament_consistency();
CREATE CONSTRAINT TRIGGER tournament_match_check AFTER INSERT OR UPDATE ON "TournamentMatch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tournament_consistency();
CREATE CONSTRAINT TRIGGER tournament_binding_check AFTER INSERT OR UPDATE ON "TournamentBinding" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tournament_consistency();
CREATE CONSTRAINT TRIGGER tournament_result_check AFTER INSERT ON "TournamentResult" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tournament_consistency();
CREATE CONSTRAINT TRIGGER tournament_award_check AFTER INSERT ON "TournamentAward" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tournament_consistency();
ALTER TABLE "TournamentDispute" ADD FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT;
ALTER TABLE "TournamentDispute" ADD FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE RESTRICT;
ALTER TABLE "TournamentDispute" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
CREATE TRIGGER tournament_dispute_immutable BEFORE UPDATE OR DELETE ON "TournamentDispute" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION tournament_dispute_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.code NOT IN ('RESULT_INCONSISTENT','CONNECTION_FAILURE','COLLUSION') OR NOT EXISTS(SELECT 1 FROM "Tournament" t JOIN "TournamentMatch" m ON m."tournamentId"=t.id JOIN "TournamentEntry" e ON e.id IN(m."leftEntryId",m."rightEntryId") WHERE t.id=NEW."tournamentId" AND m.id=NEW."matchId" AND e."userId"=NEW."userId" AND t.status='COMPLETED' AND clock_timestamp()<t."completedAt"+((t.policy->>'disputeWindowHours')::int * interval '1 hour')) THEN RAISE EXCEPTION 'TOURNAMENT_REPORT_SCOPE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tournament_dispute_write BEFORE INSERT ON "TournamentDispute" FOR EACH ROW EXECUTE FUNCTION tournament_dispute_guard();
