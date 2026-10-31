-- Owned disposable DB only. Production retains entitlements/journal and disables new purchase admission.
DROP TABLE "ScreenEvent","OwnedScreen";
DROP FUNCTION screen_purchase_origin(),screen_event_reconcile();
