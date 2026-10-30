-- Owned test reversal. Never erase deployed payment evidence or infer historical receipts.
ALTER TABLE "CosmeticGrant" DROP CONSTRAINT "CosmeticGrant_purchaseId_fkey";
DROP TRIGGER verified_grant_consistent ON "CosmeticGrant";
DROP TABLE "BillingAcknowledgement","BillingInbox","PurchaseEvent","VerifiedPurchase","BillingBinding";
DROP FUNCTION purchase_transition(),verified_purchase_consistent(),billing_inbox_identity();
ALTER TABLE "CosmeticGrant" DROP COLUMN "purchaseId";
CREATE OR REPLACE FUNCTION cosmetic_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable cosmetic provenance';END IF;
 IF NEW."id"<>OLD."id" OR NEW."userId"<>OLD."userId" OR NEW."itemId"<>OLD."itemId" OR NEW."sourceKey"<>OLD."sourceKey" OR NEW."issuedAt"<>OLD."issuedAt" OR OLD."status"<>'ACTIVE' OR NEW."status"<>'REVOKED' OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'invalid cosmetic revocation';END IF;RETURN NEW;
END $$;
DROP FUNCTION billing_ack_identity();
