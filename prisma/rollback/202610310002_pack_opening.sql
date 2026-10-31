-- Owned disposable database only; production disables opening and retains all evidence.
DROP TABLE "SupplyEvent","SupplyBalance","PackOpening","PackStock";
DROP FUNCTION supply_balance_guard(),supply_reconcile(),pack_stock_guard(),pack_stock_reconcile(),pack_opening_reconcile();
