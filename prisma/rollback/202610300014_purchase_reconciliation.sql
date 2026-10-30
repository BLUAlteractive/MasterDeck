DROP TRIGGER billing_tombstone_consistent ON "VerifiedPurchase";
DROP TABLE "BillingVoidScan","BillingRevocation","PurchaseReconciliation";
DROP FUNCTION billing_tombstone_consistent(),billing_reconciliation_identity(),billing_scan_transition();
