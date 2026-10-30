-- Runner-owned disposable database only; preserve ledgers in deployed forward repair.
DROP TABLE "RestrictedEntry","RestrictedTransfer","RestrictedAccount";
DROP FUNCTION restricted_account_identity(),restricted_transfer_consistent(),restricted_balance_consistent();
