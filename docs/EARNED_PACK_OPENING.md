# Earned pack opening

`POST /v1/packs/:packId/open` accepts only a UUID command and expected published definition hash. A fresh authenticated owner must have earned Trail Credits. The server rechecks published art, availability, optional trusted region, stock and reviewed policy. Client prices, odds, draws and currency choices are never accepted.

One transaction debits Trail Credits, reserves a whole opening, creates new bound card instances with immutable origins and/or Trail Ink supply events, and persists the exact outcome receipt. User and stock locks serialize retries and competing owners. Failure rolls back every effect. `ALLOW_COPIES` creates distinct instances; it never changes face probability in games.

HMAC-SHA256 rejection sampling selects integer-weight rewards using a new server-only 32-byte seed. Persist the authenticated encrypted seed with its key version, definition snapshot, draw indices and public SHA256 commitment. An internal audit replays it; no endpoint exposes seeds, boxes or indices. Preserve historical encryption keys for audits. Main has no approved opening policy, encryption key or trusted region resolver and therefore cannot open new packs. Test keys and rights evidence are disposable fixtures, not production approval.

Owner-only `GET /v1/packs/openings/:openingId` returns the committed safe receipt, including after the offer is retired. A repeated command returns the same IDs without contacting the optional region provider. `GET /v1/packs/supplies` reports Trail Ink as a bound, nontransferable, nonpurchasable supply. Trail Ink is not an exchangeable wallet currency. Privacy exports omit secret RNG material.

Migration `202610310002_pack_opening` adds opening/stock/supply history and deferred reconciliation. Its reverse SQL is for disposable development databases only. Production repair preserves immutable receipts, journals and provenance. Operational events contain aggregate success only; monitor transaction failures and reconciliation errors without logging user IDs, proof payloads or seeds. Economic pricing/odds, real provider trust and key operations require reviewed configuration before activation.
