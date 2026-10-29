-- Disposable-test reversal only; never removes inventory/history.
BEGIN;
DROP TABLE "CardFavorite";
COMMIT;
