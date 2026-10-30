CREATE TABLE "PlayChipAccount"("id" uuid PRIMARY KEY,"kind" text NOT NULL CHECK("kind" IN ('PLAYER','ESCROW','ISSUANCE')),"userId" uuid UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT,"roomId" uuid UNIQUE REFERENCES "GameRoom"("id") ON DELETE RESTRICT,"balance" bigint NOT NULL DEFAULT 0 CHECK("balance" BETWEEN -9000000000000000000 AND 9000000000000000000),CHECK("kind"='ISSUANCE' OR "balance">=0),CHECK(("kind"='PLAYER' AND "userId" IS NOT NULL AND "roomId" IS NULL) OR ("kind"='ESCROW' AND "roomId" IS NOT NULL AND "userId" IS NULL) OR ("kind"='ISSUANCE' AND "userId" IS NULL AND "roomId" IS NULL)));
CREATE UNIQUE INDEX "PlayChipAccount_one_issuance" ON "PlayChipAccount"("kind") WHERE "kind"='ISSUANCE';
CREATE TABLE "PlayChipTransfer"("id" uuid PRIMARY KEY,"sourceKey" text NOT NULL UNIQUE,"requestHash" text NOT NULL CHECK("requestHash" ~ '^[a-f0-9]{64}$'),"kind" text NOT NULL CHECK("kind" IN ('EARNED_GRANT','RESERVE','SETTLE')),"operatorId" text NOT NULL CHECK(length("operatorId") BETWEEN 1 AND 128),"createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "PlayChipEntry"("transferId" uuid NOT NULL REFERENCES "PlayChipTransfer"("id") ON DELETE RESTRICT,"accountId" uuid NOT NULL REFERENCES "PlayChipAccount"("id") ON DELETE RESTRICT,"amount" bigint NOT NULL CHECK("amount"<>0),PRIMARY KEY("transferId","accountId"));
CREATE INDEX "PlayChipEntry_accountId_transferId_idx" ON "PlayChipEntry"("accountId","transferId");
CREATE TABLE "GameAdmission"("roomId" uuid PRIMARY KEY REFERENCES "GameRoom"("id") ON DELETE RESTRICT,"lobbyId" uuid NOT NULL UNIQUE REFERENCES "Lobby"("id") ON DELETE RESTRICT,"buyIn" integer NOT NULL CHECK("buyIn" BETWEEN 1 AND 166666666),"policyVersion" text NOT NULL,"policySnapshot" jsonb NOT NULL);
CREATE TABLE "GameReservation"("roomId" uuid NOT NULL REFERENCES "GameAdmission"("roomId") ON DELETE RESTRICT,"userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,"snapshot" jsonb NOT NULL,PRIMARY KEY("roomId","userId"));
CREATE TABLE "GameResult"("roomId" uuid PRIMARY KEY REFERENCES "GameRoom"("id") ON DELETE RESTRICT,"stateVersion" integer NOT NULL,"rulesetVersion" text NOT NULL,"allocation" jsonb NOT NULL,"createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER chip_transfer_immutable BEFORE UPDATE OR DELETE ON "PlayChipTransfer" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER chip_entry_immutable BEFORE UPDATE OR DELETE ON "PlayChipEntry" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER game_admission_immutable BEFORE UPDATE OR DELETE ON "GameAdmission" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER game_reservation_immutable BEFORE UPDATE OR DELETE ON "GameReservation" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER game_result_immutable BEFORE UPDATE OR DELETE ON "GameResult" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION chip_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable chip account'; END IF;
 IF NEW."id"<>OLD."id" OR NEW."kind"<>OLD."kind" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."roomId" IS DISTINCT FROM OLD."roomId" THEN RAISE EXCEPTION 'immutable chip account'; END IF;RETURN NEW; END $$;
CREATE TRIGGER chip_account_identity BEFORE UPDATE OR DELETE ON "PlayChipAccount" FOR EACH ROW EXECUTE FUNCTION chip_account_identity();
CREATE FUNCTION chip_account_balanced() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE aid uuid; b bigint; total numeric; BEGIN
 IF TG_TABLE_NAME='PlayChipAccount' THEN aid:=NEW."id";ELSE aid:=NEW."accountId";END IF;
 SELECT "balance" INTO b FROM "PlayChipAccount" WHERE "id"=aid;SELECT COALESCE(sum("amount"),0) INTO total FROM "PlayChipEntry" WHERE "accountId"=aid;
 IF b IS DISTINCT FROM total THEN RAISE EXCEPTION 'chip balance differs from ledger';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER chip_account_balanced AFTER INSERT OR UPDATE ON "PlayChipAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION chip_account_balanced();
CREATE CONSTRAINT TRIGGER chip_entry_balanced AFTER INSERT ON "PlayChipEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION chip_account_balanced();
CREATE FUNCTION chip_transfer_balanced() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE tid uuid; total numeric; n integer; BEGIN
 IF TG_TABLE_NAME='PlayChipTransfer' THEN tid:=NEW."id";ELSE tid:=NEW."transferId";END IF;
 SELECT COALESCE(sum("amount"),0),count(*) INTO total,n FROM "PlayChipEntry" WHERE "transferId"=tid;
 IF total<>0 OR n<2 THEN RAISE EXCEPTION 'unbalanced chip transfer';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER chip_transfer_balanced AFTER INSERT ON "PlayChipTransfer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION chip_transfer_balanced();
CREATE CONSTRAINT TRIGGER chip_transfer_entry_balanced AFTER INSERT ON "PlayChipEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION chip_transfer_balanced();
CREATE FUNCTION game_result_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r "GameRoom"; b bigint; BEGIN
 SELECT * INTO r FROM "GameRoom" WHERE "id"=NEW."roomId";
 SELECT "balance" INTO b FROM "PlayChipAccount" WHERE "roomId"=NEW."roomId";
 IF r."status"<>'COMPLETE' OR r."stateVersion"<>NEW."stateVersion" OR r."rulesetVersion"<>NEW."rulesetVersion" OR b IS DISTINCT FROM 0::bigint THEN RAISE EXCEPTION 'invalid game result';END IF;
 IF EXISTS(SELECT 1 FROM "CardInstance" WHERE "lockToken"=NEW."roomId") THEN RAISE EXCEPTION 'game cards still reserved';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER game_result_consistent AFTER INSERT ON "GameResult" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION game_result_consistent();

ALTER TABLE "Lobby" DROP CONSTRAINT "Lobby_status_check",ADD CHECK("status" IN ('OPEN','STARTED','CLOSED'));
CREATE FUNCTION lobby_started_seats() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM "Lobby" WHERE "id"=OLD."lobbyId" AND "status"='STARTED') THEN RAISE EXCEPTION 'active game seat';END IF;IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END $$;
CREATE TRIGGER lobby_started_seats BEFORE UPDATE OR DELETE ON "LobbySeat" FOR EACH ROW EXECUTE FUNCTION lobby_started_seats();
ALTER TABLE "GameReservation" ADD FOREIGN KEY("roomId","userId") REFERENCES "GameParticipant"("roomId","userId") ON DELETE RESTRICT;
CREATE FUNCTION game_admission_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE rid uuid; a "GameAdmission"; n integer; reserved integer; chips bigint; BEGIN
 rid:=NEW."roomId";SELECT * INTO STRICT a FROM "GameAdmission" WHERE "roomId"=rid;
 SELECT count(*) INTO n FROM "GameParticipant" WHERE "roomId"=rid;
 SELECT count(*) INTO reserved FROM "GameReservation" WHERE "roomId"=rid;
 SELECT "balance" INTO chips FROM "PlayChipAccount" WHERE "roomId"=rid;
 IF a."policySnapshot"->>'version' IS DISTINCT FROM a."policyVersion" OR (a."policySnapshot"->>'buyIn')::integer IS DISTINCT FROM a."buyIn" OR COALESCE(length(a."policySnapshot"->>'approvalReference'),0)=0 OR n NOT BETWEEN 2 AND 6 OR n<>reserved OR chips IS DISTINCT FROM (a."buyIn"::bigint*n) OR EXISTS(SELECT 1 FROM "GameReservation" WHERE "roomId"=rid AND jsonb_array_length("snapshot")<>52) OR NOT EXISTS(SELECT 1 FROM "Lobby" WHERE "id"=a."lobbyId" AND "status"='STARTED') THEN RAISE EXCEPTION 'incomplete funded admission';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER game_admission_consistent AFTER INSERT ON "GameAdmission" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION game_admission_consistent();
CREATE CONSTRAINT TRIGGER game_reservation_consistent AFTER INSERT ON "GameReservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION game_admission_consistent();

CREATE OR REPLACE FUNCTION chip_transfer_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; total numeric; n integer; k text; src text; rid uuid; uid uuid; value bigint; players integer; issuer integer; escrow integer;
BEGIN
 IF TG_TABLE_NAME='PlayChipTransfer' THEN tid:=NEW."id";ELSE tid:=NEW."transferId";END IF;
 SELECT "kind","sourceKey" INTO k,src FROM "PlayChipTransfer" WHERE "id"=tid;
 SELECT COALESCE(sum("amount"),0),count(*) INTO total,n FROM "PlayChipEntry" WHERE "transferId"=tid;
 IF total<>0 OR n<2 THEN RAISE EXCEPTION 'unbalanced chip transfer';END IF;
 SELECT count(*) FILTER(WHERE a."kind"='PLAYER' AND e."amount">0),count(*) FILTER(WHERE a."kind"='ISSUANCE' AND e."amount"<0),count(*) FILTER(WHERE a."kind"='ESCROW' AND e."amount"<0) INTO players,issuer,escrow FROM "PlayChipEntry" e JOIN "PlayChipAccount" a ON a."id"=e."accountId" WHERE e."transferId"=tid;
 IF k='EARNED_GRANT' THEN
  IF n<>2 OR players<>1 OR issuer<>1 OR EXISTS(SELECT 1 FROM "PlayChipEntry" WHERE "transferId"=tid AND abs("amount"::numeric)>1000000000) THEN RAISE EXCEPTION 'invalid earned source';END IF;
 ELSIF k='RESERVE' THEN
  SELECT a."roomId",e."amount" INTO rid,value FROM "PlayChipEntry" e JOIN "PlayChipAccount" a ON a."id"=e."accountId" WHERE e."transferId"=tid AND a."kind"='ESCROW' AND e."amount">0;
  SELECT a."userId" INTO uid FROM "PlayChipEntry" e JOIN "PlayChipAccount" a ON a."id"=e."accountId" WHERE e."transferId"=tid AND a."kind"='PLAYER' AND e."amount"<0;
  IF n<>2 OR rid IS NULL OR uid IS NULL OR src IS DISTINCT FROM ('game:'||rid::text||':reserve:'||uid::text) OR NOT EXISTS(SELECT 1 FROM "GameAdmission" g JOIN "GameParticipant" p ON p."roomId"=g."roomId" WHERE g."roomId"=rid AND g."buyIn"=value AND p."userId"=uid) THEN RAISE EXCEPTION 'invalid game reserve';END IF;
 ELSIF k='SETTLE' THEN
  SELECT a."roomId" INTO rid FROM "PlayChipEntry" e JOIN "PlayChipAccount" a ON a."id"=e."accountId" WHERE e."transferId"=tid AND a."kind"='ESCROW' AND e."amount"<0;
  IF escrow<>1 OR players<>n-1 OR rid IS NULL OR src IS DISTINCT FROM ('game:'||rid::text||':settle') OR NOT EXISTS(SELECT 1 FROM "GameResult" WHERE "roomId"=rid) THEN RAISE EXCEPTION 'invalid game settlement';END IF;
  IF EXISTS(SELECT 1 FROM "PlayChipEntry" e JOIN "PlayChipAccount" a ON a."id"=e."accountId" WHERE e."transferId"=tid AND a."kind"='PLAYER' AND NOT EXISTS(SELECT 1 FROM "GameResult" r CROSS JOIN LATERAL jsonb_array_elements(r."allocation"->'players') p WHERE r."roomId"=rid AND p->>'playerId'=a."userId"::text AND (p->>'finalStack')::bigint=e."amount")) THEN RAISE EXCEPTION 'settlement differs from result';END IF;
 END IF;RETURN NULL;
END $$;
