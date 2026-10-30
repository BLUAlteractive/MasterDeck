-- CreateTable
CREATE TABLE "RestrictedAccount" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "currency" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "RestrictedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestrictedTransfer" (
    "id" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "proofReference" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestrictedTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestrictedEntry" (
    "transferId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "RestrictedEntry_pkey" PRIMARY KEY ("transferId","accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestrictedAccount_userId_currency_key" ON "RestrictedAccount"("userId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "RestrictedTransfer_sourceKey_key" ON "RestrictedTransfer"("sourceKey");

-- CreateIndex
CREATE INDEX "RestrictedEntry_accountId_transferId_idx" ON "RestrictedEntry"("accountId", "transferId");

-- AddForeignKey
ALTER TABLE "RestrictedAccount" ADD CONSTRAINT "RestrictedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestrictedEntry" ADD CONSTRAINT "RestrictedEntry_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "RestrictedTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestrictedEntry" ADD CONSTRAINT "RestrictedEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "RestrictedAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestrictedAccount" ADD CHECK (
 "currency" IN ('TRAIL_CREDITS','STORE_GEMS') AND
 (("kind"='PLAYER' AND "userId" IS NOT NULL AND "balance">=0) OR
  ("userId" IS NULL AND (("kind"='ISSUANCE' AND "id"=CASE "currency" WHEN 'TRAIL_CREDITS' THEN '00000000-0000-4000-8000-000000000381'::uuid ELSE '00000000-0000-4000-8000-000000000383'::uuid END) OR
  ("kind"='SINK' AND "balance">=0 AND "id"=CASE "currency" WHEN 'TRAIL_CREDITS' THEN '00000000-0000-4000-8000-000000000382'::uuid ELSE '00000000-0000-4000-8000-000000000384'::uuid END)))));
ALTER TABLE "RestrictedEntry" ADD CHECK ("amount"<>0 AND abs("amount")<=1000000000000);
ALTER TABLE "RestrictedTransfer" ADD CHECK (length("proofReference") BETWEEN 1 AND 200 AND length("policyVersion") BETWEEN 1 AND 100);
CREATE TRIGGER restricted_transfer_immutable BEFORE UPDATE OR DELETE ON "RestrictedTransfer" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE TRIGGER restricted_entry_immutable BEFORE UPDATE OR DELETE ON "RestrictedEntry" FOR EACH ROW EXECUTE FUNCTION game_immutable();
CREATE FUNCTION restricted_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable wallet account'; END IF;
 IF NEW."id"<>OLD."id" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."currency"<>OLD."currency" OR NEW."kind"<>OLD."kind" THEN RAISE EXCEPTION 'immutable wallet identity'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER restricted_account_identity BEFORE UPDATE OR DELETE ON "RestrictedAccount" FOR EACH ROW EXECUTE FUNCTION restricted_account_identity();
CREATE FUNCTION restricted_transfer_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE tid uuid; t "RestrictedTransfer"; n integer; player_amount bigint; system_kind text; expected_kind text; expected_sign integer; BEGIN
 IF TG_TABLE_NAME='RestrictedTransfer' THEN tid:=NEW."id";ELSE tid:=NEW."transferId";END IF;
 SELECT * INTO STRICT t FROM "RestrictedTransfer" WHERE "id"=tid;
 expected_kind:=NULL;expected_sign:=-1;
 IF t."currency"='TRAIL_CREDITS' THEN
  IF t."purpose" IN ('EARN_ACTIVITY','EARN_ACCESSIBLE_QUEST') THEN expected_kind:='ISSUANCE';expected_sign:=1;
  ELSIF t."purpose" IN ('BUY_SCREEN','BUY_EARNED_PACK','BUY_SUPPLY') THEN expected_kind:='SINK';END IF;
 ELSIF t."currency"='STORE_GEMS' THEN
  IF t."purpose"='VERIFIED_PURCHASE' THEN expected_kind:='ISSUANCE';expected_sign:=1;
  ELSIF t."purpose"='BUY_COSMETIC' THEN expected_kind:='SINK';
  ELSIF t."purpose"='PURCHASE_REFUND' THEN expected_kind:='ISSUANCE';END IF;
 END IF;
 SELECT count(*) INTO n FROM "RestrictedEntry" WHERE "transferId"=tid;
 SELECT e."amount" INTO player_amount FROM "RestrictedEntry" e JOIN "RestrictedAccount" a ON a."id"=e."accountId" WHERE e."transferId"=tid AND a."kind"='PLAYER';
 SELECT a."kind" INTO system_kind FROM "RestrictedEntry" e JOIN "RestrictedAccount" a ON a."id"=e."accountId" WHERE e."transferId"=tid AND a."kind"<>'PLAYER';
 IF expected_kind IS NULL OR n<>2 OR player_amount IS NULL OR sign(player_amount)<>expected_sign OR system_kind IS DISTINCT FROM expected_kind
 OR (SELECT sum("amount") FROM "RestrictedEntry" WHERE "transferId"=tid)<>0
 OR EXISTS(SELECT 1 FROM "RestrictedEntry" e JOIN "RestrictedAccount" a ON a."id"=e."accountId" WHERE e."transferId"=tid AND a."currency"<>t."currency") THEN RAISE EXCEPTION 'forbidden wallet transfer';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER restricted_transfer_consistent AFTER INSERT ON "RestrictedTransfer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION restricted_transfer_consistent();
CREATE CONSTRAINT TRIGGER restricted_entry_consistent AFTER INSERT ON "RestrictedEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION restricted_transfer_consistent();
CREATE FUNCTION restricted_balance_consistent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE aid uuid; b bigint; n numeric; BEGIN
 IF TG_TABLE_NAME='RestrictedAccount' THEN aid:=NEW."id";ELSE aid:=NEW."accountId";END IF;
 SELECT "balance" INTO b FROM "RestrictedAccount" WHERE "id"=aid;
 SELECT COALESCE(sum("amount"),0) INTO n FROM "RestrictedEntry" WHERE "accountId"=aid;
 IF b IS DISTINCT FROM n THEN RAISE EXCEPTION 'wallet reconciliation failed';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER restricted_balance_consistent AFTER INSERT OR UPDATE ON "RestrictedAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION restricted_balance_consistent();
CREATE CONSTRAINT TRIGGER restricted_entry_balance AFTER INSERT ON "RestrictedEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION restricted_balance_consistent();
